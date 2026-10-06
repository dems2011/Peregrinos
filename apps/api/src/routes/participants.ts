import type { FastifyInstance } from "fastify";
import { publish } from "../lib/bus";
import { z } from "zod";
import QRCode from "qrcode";
import { Prisma, type Participant } from "@prisma/client";
import {
  createParticipantSchema, deriveAttendance, digitsOnly, normalizeDocument, parseQrContent, participantListSchema,
  qrContent, updateParticipantSchema, qBool,
} from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { eventParam, loadEvent, loadEventWith, lockEvent } from "../lib/access";
import { newQrToken } from "../lib/tokens";
import { personScope, resolvePersonForParticipation } from "../lib/persons";
import { randomUUID } from "node:crypto";
import { assertCapacityFor } from "../lib/eventLifecycle";
import { buildTemplate, ImportFormatError, parseWorkbook, validateRows } from "../lib/importer";

const idParam = eventParam.extend({ id: z.string().uuid() });

/** El operador ve lo necesario para identificar y asistir a la persona (nombre, documento y teléfono); nunca notas, foto ni QR. */
function view(p: Participant, role: string) {
  const base = { id: p.id, personId: p.personId, number: p.number, firstName: p.firstName, lastName: p.lastName, documentNumber: p.documentNumber, status: p.status };
  if (role === "OPERATOR") return { ...base, phone: p.phone };
  return { ...base, documentType: p.documentType, phone: p.phone, notes: p.notes, photoUrl: p.photoUrl, createdAt: p.createdAt };
}

export default async function participantRoutes(app: FastifyInstance) {
  /** Búsqueda por número, nombre, apellido, documento o teléfono. */
  app.get("/", { preHandler: app.requirePermission("participant:read") }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const q = participantListSchema.parse(req.query);
    const text = q.q ?? "";
    const digits = digitsOnly(text);
    const doc = normalizeDocument(text);
    const or: Prisma.ParticipantWhereInput[] = [];
    if (text) {
      or.push({ firstName: { contains: text, mode: "insensitive" } }, { lastName: { contains: text, mode: "insensitive" } });
      if (/^\d{1,6}$/.test(text)) or.push({ number: Number(text) });
      if (doc.length >= 3) or.push({ documentNumber: { contains: doc } });
      if (digits.length >= 4) or.push({ phoneDigits: { contains: digits } });
      // Nombre completo "María González"
      const parts = text.split(/\s+/).filter(Boolean);
      if (parts.length > 1) or.push({ AND: parts.map((w) => ({ OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }] })) });
    }
    const where: Prisma.ParticipantWhereInput = { eventId, ...(q.status && { status: q.status }), ...(or.length && { OR: or }) };
    const pageSize = req.auth.role === "OPERATOR" ? Math.min(q.pageSize, 10) : q.pageSize;
    const [total, items] = await prisma.$transaction([
      prisma.participant.count({ where }),
      prisma.participant.findMany({ where, orderBy: { number: "asc" }, skip: (q.page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page: q.page, pageSize, items: items.map((p) => view(p, req.auth.role)) };
  });

  /**
   * Identificación rápida en el punto de control: ?number=2  o  ?qr=PG1:<token>
   * Con ?checkpointId=... avisa si la persona ya registró llegada ahí (antes de confirmar).
   */
  app.get("/lookup", { preHandler: app.requirePermission("participant:read") }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const q = z.object({
      number: z.coerce.number().int().min(1).optional(),
      qr: z.string().max(200).optional(),
      checkpointId: z.string().uuid().optional(),
    }).refine((v) => v.number || v.qr, "Indica número o QR").parse(req.query);

    let where: Prisma.ParticipantWhereInput;
    if (q.qr) {
      const token = parseQrContent(q.qr);
      if (!token) throw new AppError(400, "INVALID_QR", "Este código QR no es de Peregrinos.");
      where = { eventId, qrToken: token };
    } else where = { eventId, number: q.number };

    const p = await prisma.participant.findFirst({ where });
    if (!p) throw notFound(q.qr ? "Este QR no corresponde a ningún participante de este evento." : "No existe una persona con ese número.");
    const existing = q.checkpointId
      ? await prisma.checkin.findFirst({
          where: { eventId, participantId: p.id, checkpointId: q.checkpointId, status: "ACTIVE" },
          include: { operator: { select: { name: true } } },
        })
      : null;
    const checkpoint = q.checkpointId ? await prisma.checkpoint.findFirst({ where: { id: q.checkpointId, eventId }, select: { id: true, name: true } }) : null;
    return {
      participant: view(p, req.auth.role),
      /** Punto y hora del momento de la lectura (se guardan al confirmar la llegada). */
      checkpoint,
      serverTime: new Date().toISOString(),
      alreadyCheckedIn: existing ? { checkinId: existing.id, timestamp: existing.timestamp, operator: existing.operator.name } : null,
    };
  });

  app.get("/import/template", { preHandler: app.requirePermission("participant:manage") }, async (_req, reply) => {
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", 'attachment; filename="plantilla-participantes.xlsx"');
    return reply.send(await buildTemplate());
  });

  /**
   * Importación masiva desde XLSX.
   *  ?mode=preview (por defecto): valida y devuelve el resumen, sin guardar nada.
   *  ?mode=commit: vuelve a validar y guarda solo las filas válidas.
   * Sin estado en el servidor: el cliente envía el mismo archivo en ambos pasos.
   */
  app.post("/import", { preHandler: app.requirePermission("participant:manage") }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEventWith(req, eventId, "PARTICIPANTS");
    const mode = z.enum(["preview", "commit"]).default("preview").parse((req.query as { mode?: string }).mode);
    const file = await req.file();
    if (!file) throw new AppError(400, "NO_FILE", "Adjunta un archivo Excel (.xlsx).");
    const buffer = await file.toBuffer();

    let rows;
    try { rows = await parseWorkbook(buffer); }
    catch (e) { if (e instanceof ImportFormatError) throw new AppError(400, "IMPORT_FORMAT", e.message); throw e; }

    const result = await prisma.$transaction(async (tx) => {
      await lockEvent(tx, eventId);
      const existing = await tx.participant.findMany({ where: { eventId }, select: { number: true, documentNumber: true } });
      const v = validateRows(rows, new Set(existing.map((e) => e.number)), new Set(existing.map((e) => e.documentNumber)));
      if (mode === "preview") return { v, imported: 0 };
      // A4: la importación también respeta el cupo: si no entran todas las filas válidas, no se importa ninguna.
      await assertCapacityFor(tx, eventId, v.valid.length);

      // Filas sin número: reciben los siguientes libres, sin chocar con los números explícitos del archivo.
      const taken = new Set([...existing.map((e) => e.number), ...v.valid.flatMap((r) => (r.number ? [r.number] : []))]);
      let next = Math.max(0, ...taken);
      // A4a: cada fila importada crea su propia Person de la organización. La importación nunca fusiona por
      // coincidencia de documento: los posibles duplicados se fusionan después, de forma explícita.
      const persons = v.valid.map((r) => ({
        id: randomUUID(), firstName: r.firstName, lastName: r.lastName, documentType: "DNI", documentNumber: r.documentNumber,
        phone: r.phone, phoneDigits: digitsOnly(r.phone), ownerOrganizationId: req.auth.organizationId,
      }));
      await tx.person.createMany({ data: persons });
      const data = v.valid.map((r, i) => ({
        eventId, personId: persons[i].id, number: r.number ?? ++next, firstName: r.firstName, lastName: r.lastName,
        documentNumber: r.documentNumber, phone: r.phone, phoneDigits: digitsOnly(r.phone), qrToken: newQrToken(),
      }));
      await tx.participant.createMany({ data });
      return { v, imported: data.length };
    });

    const { v } = result;
    const summary = {
      total: v.total, valid: v.valid.length, invalid: v.invalidRows,
      duplicateDocuments: v.duplicateDocuments, duplicateNumbers: v.duplicateNumbers,
      issues: v.issues.slice(0, 200), issuesTruncated: v.issues.length > 200,
    };
    if (mode === "commit") {
      await audit(req, { action: "PARTICIPANTS_IMPORTED", entityType: "Event", entityId: eventId, eventId, metadata: { file: file.filename, total: v.total, imported: result.imported, rejected: v.invalidRows } });
      publish(eventId, { type: "participants.changed", data: { imported: result.imported } });
      return reply.status(201).send({ ...summary, imported: result.imported });
    }
    return summary;
  });

  app.post("/", { preHandler: app.requirePermission("participant:create") }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEventWith(req, eventId, "PARTICIPANTS");
    const body = createParticipantSchema.parse(req.body);
    const documentNumber = normalizeDocument(body.documentNumber);
    const p = await prisma.$transaction(async (tx) => {
      await lockEvent(tx, eventId);
      if (await tx.participant.findFirst({ where: { eventId, documentNumber } })) {
        throw new AppError(409, "DUPLICATE_DOCUMENT", "Ya existe una persona con ese documento en este evento.");
      }
      // A4a: la participación pertenece a una Person (sin cuenta necesaria). Coincidencias → el personal elige o confirma.
      const personId = await resolvePersonForParticipation(tx, personScope(req.auth), body);
      if (await tx.participant.findFirst({ where: { eventId, personId } })) {
        throw new AppError(409, "PERSON_ALREADY_PARTICIPATES", "Esta persona ya participa en este evento.");
      }
      // A4: el alta manual también respeta el cupo (evento bloqueado).
      await assertCapacityFor(tx, eventId, 1);
      let number = body.number;
      if (number) {
        if (await tx.participant.findFirst({ where: { eventId, number } })) throw new AppError(409, "DUPLICATE_NUMBER", `El número ${number} ya está en uso.`);
      } else {
        number = ((await tx.participant.aggregate({ where: { eventId }, _max: { number: true } }))._max.number ?? 0) + 1;
      }
      return tx.participant.create({
        data: {
          eventId, personId, number, firstName: body.firstName, lastName: body.lastName, documentNumber, documentType: body.documentType,
          phone: body.phone, phoneDigits: digitsOnly(body.phone), notes: body.notes, qrToken: newQrToken(),
        },
      });
    });
    await audit(req, { action: "PARTICIPANT_CREATED", entityType: "Participant", entityId: p.id, eventId, metadata: { number: p.number } });
    publish(eventId, { type: "participants.changed", data: { participantId: p.id } });
    return reply.status(201).send(view(p, req.auth.role));
  });

  /** Ficha: datos + progreso del recorrido (llegó / pendiente por punto). */
  app.get("/:id", { preHandler: app.requirePermission("participant:read") }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    const event = await loadEvent(req, eventId);
    const p = await prisma.participant.findFirst({ where: { id, eventId } });
    if (!p) throw notFound("Persona no encontrada.");
    const [cps, checkins] = await Promise.all([
      prisma.checkpoint.findMany({ where: { eventId, status: "ACTIVE" }, orderBy: { order: "asc" } }),
      prisma.checkin.findMany({ where: { eventId, participantId: id, status: "ACTIVE" } }),
    ]);
    const at = new Map(checkins.map((c) => [c.checkpointId, c]));
    const route = cps.map((c) => ({ checkpointId: c.id, order: c.order, name: c.name, arrived: at.has(c.id), timestamp: at.get(c.id)?.timestamp ?? null }));
    const done = route.filter((r) => r.arrived).length;
    // A4: asistencia derivada de las llegadas ACTIVE y del estado del evento (no se guarda).
    const attendance = deriveAttendance({ eventStatus: event.status, participantStatus: p.status, activeCheckins: checkins.length });
    return { participant: view(p, req.auth.role), route, progress: { done, total: route.length, percent: route.length ? Math.round((done / route.length) * 100) : 0 }, attendance };
  });

  app.patch("/:id", { preHandler: app.requirePermission("participant:manage") }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEventWith(req, eventId, "PARTICIPANTS");
    const body = updateParticipantSchema.parse(req.body);
    const before = await prisma.participant.findFirst({ where: { id, eventId } });
    if (!before) throw notFound("Persona no encontrada.");
    const { documentNumber, phone, number, ...rest } = body;
    const data: Prisma.ParticipantUpdateInput = { ...rest };
    if (documentNumber) data.documentNumber = normalizeDocument(documentNumber);
    if (phone) { data.phone = phone; data.phoneDigits = digitsOnly(phone); }
    if (number) data.number = number;
    try {
      const p = await prisma.$transaction(async (tx) => {
        if (body.status !== "ACTIVE") return tx.participant.update({ where: { id }, data });
        // A4: reactivar (CANCELLED → ACTIVE) suma un participante ACTIVE: cupo con el evento bloqueado y
        // transición condicional sobre el estado leído dentro del bloqueo.
        await lockEvent(tx, eventId);
        const current = await tx.participant.findUniqueOrThrow({ where: { id }, select: { status: true } });
        if (current.status !== "ACTIVE") await assertCapacityFor(tx, eventId, 1);
        return tx.participant.update({ where: { id, status: current.status }, data });
      });
      await audit(req, { action: "PARTICIPANT_UPDATED", entityType: "Participant", entityId: id, eventId, metadata: { fields: Object.keys(body), ...(body.status && { status: { from: before.status, to: p.status } }) } });
      return view(p, req.auth.role);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppError(409, "DUPLICATE", "Ya existe otra persona con ese número o documento en este evento.");
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        throw new AppError(409, "PARTICIPANT_CHANGED", "La participación cambió. Vuelve a cargarla.");
      }
      throw e;
    }
  });

  /** QR: contiene solo "PG1:<token opaco>". ?format=svg|png  &download=1 para descargar. */
  app.get("/:id/qr", { preHandler: app.requirePermission("participant:manage") }, async (req, reply) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEvent(req, eventId);
    const { format, download } = z.object({ format: z.enum(["svg", "png"]).default("svg"), download: qBool }).parse(req.query);
    const p = await prisma.participant.findFirst({ where: { id, eventId } });
    if (!p) throw notFound("Persona no encontrada.");
    const content = qrContent(p.qrToken);
    const name = `qr-${String(p.number).padStart(3, "0")}.${format}`;
    if (download) reply.header("Content-Disposition", `attachment; filename="${name}"`);
    reply.header("Cache-Control", "private, no-store");
    if (format === "png") {
      reply.header("Content-Type", "image/png");
      return reply.send(await QRCode.toBuffer(content, { type: "png", width: 600, margin: 2, errorCorrectionLevel: "M" }));
    }
    reply.header("Content-Type", "image/svg+xml");
    return reply.send(await QRCode.toString(content, { type: "svg", margin: 2, errorCorrectionLevel: "M" }));
  });

  /** Genera un QR nuevo (p. ej. credencial perdida). El anterior deja de funcionar. */
  app.post("/:id/qr/regenerate", { preHandler: app.requirePermission("participant:manage") }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEventWith(req, eventId, "PARTICIPANTS");
    const p = await prisma.participant.findFirst({ where: { id, eventId } });
    if (!p) throw notFound("Persona no encontrada.");
    await prisma.participant.update({ where: { id }, data: { qrToken: newQrToken() } });
    await audit(req, { action: "PARTICIPANT_QR_REGENERATED", entityType: "Participant", entityId: id, eventId, metadata: { number: p.number } });
    return { ok: true };
  });
  // No hay DELETE: una participación se pasa a CANCELLED para conservar su historial.
}
