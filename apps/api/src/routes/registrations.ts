import type { FastifyInstance } from "fastify";
import { publish } from "../lib/bus";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { approveRegistrationSchema, digitsOnly, normalizeDocument, registrationListSchema, rejectRegistrationSchema, reopenRegistrationSchema } from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { eventParam, loadEvent, loadEventWith, lockEvent } from "../lib/access";
import { newQrToken } from "../lib/tokens";
import { openProof } from "../lib/storage";
import { assertCapacityFor } from "../lib/eventLifecycle";

const idParam = eventParam.extend({ id: z.string().uuid() });

/** Revisión de pagos: el administrador confirma o rechaza; al confirmar la persona entra al listado oficial. */
export default async function registrationAdminRoutes(app: FastifyInstance) {
  const review = app.requirePermission("payment:review");

  /** Marca los comprobantes cuya huella ya apareció en otra inscripción (posible reutilización). */
  async function withDuplicateFlags<T extends { registrationId: string; sha256: string }>(proofs: T[], organizationId: string) {
    if (!proofs.length) return proofs.map((p) => ({ ...p, duplicateOfOther: false }));
    // Solo dentro de la organización: no revela si el mismo archivo se envió a eventos de otra organización.
    const others = await prisma.paymentProof.findMany({
      where: { sha256: { in: proofs.map((p) => p.sha256) }, registration: { event: { organizationId } } },
      select: { sha256: true, registrationId: true },
    });
    return proofs.map((p) => ({ ...p, duplicateOfOther: others.some((o) => o.sha256 === p.sha256 && o.registrationId !== p.registrationId) }));
  }

  /** Enlace público de inscripción para compartir. Se abre/cierra con PATCH del evento (registrationOpen). */
  app.get("/link", { preHandler: review }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    const e = await loadEventWith(req, eventId, "REGISTRATION");
    const open = e.registrationOpen && !!e.registrationToken;
    return { open, url: open ? `${cfg.WEB_ORIGIN}/registro/${e.registrationToken}` : null };
  });

  app.get("/", { preHandler: review }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const q = registrationListSchema.parse(req.query);
    const text = q.q ?? "";
    const where: Prisma.RegistrationWhereInput = {
      eventId, ...(q.status && { status: q.status }),
      ...(text && { OR: [
        { firstName: { contains: text, mode: "insensitive" } }, { lastName: { contains: text, mode: "insensitive" } },
        ...(normalizeDocument(text).length >= 3 ? [{ documentNumber: { contains: normalizeDocument(text) } }] : []),
        ...(digitsOnly(text).length >= 4 ? [{ phoneDigits: { contains: digitsOnly(text) } }] : []),
      ] }),
    };
    const [total, items, groups] = await prisma.$transaction([
      prisma.registration.count({ where }),
      prisma.registration.findMany({
        where, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        select: {
          id: true, firstName: true, lastName: true, documentNumber: true, phone: true, status: true, rejectionReason: true, createdAt: true, updatedAt: true,
          participant: { select: { id: true, number: true } },
          proofs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, registrationId: true, sha256: true, amount: true, reference: true, paidAt: true, createdAt: true, mimeType: true } },
        },
      }),
      prisma.registration.groupBy({ by: ["status"], where: { eventId }, orderBy: { status: "asc" }, _count: { _all: true } }),
    ]);
    const flagged = await withDuplicateFlags(items.flatMap((i) => i.proofs), req.auth.organizationId);
    const dup = new Map(flagged.map((f) => [f.id, f.duplicateOfOther]));
    return {
      total, page: q.page, pageSize: q.pageSize,
      counts: Object.fromEntries(groups.map((g) => [g.status, (g._count as { _all: number })._all])),
      items: items.map((i) => ({ ...i, proofs: i.proofs.map(({ sha256: _s, ...p }) => ({ ...p, duplicateOfOther: dup.get(p.id) ?? false })) })),
    };
  });

  app.get("/:id", { preHandler: review }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEvent(req, eventId);
    const r = await prisma.registration.findFirst({
      where: { id, eventId },
      select: {
        id: true, firstName: true, lastName: true, documentNumber: true, documentType: true, phone: true, status: true, rejectionReason: true,
        reviewedAt: true, createdAt: true, participant: { select: { id: true, number: true } },
        proofs: { orderBy: { createdAt: "desc" }, select: { id: true, registrationId: true, sha256: true, mimeType: true, sizeBytes: true, amount: true, reference: true, paidAt: true, note: true, status: true, createdAt: true } },
        // B1: respuestas a las preguntas del formulario del evento y si se inscribió con su cuenta.
        formAnswers: true, userId: true, event: { select: { registrationFields: true } },
      },
    });
    if (!r) throw notFound("Inscripción no encontrada.");
    const proofs = (await withDuplicateFlags(r.proofs, req.auth.organizationId)).map(({ sha256: _s, ...p }) => p);
    const { event, userId, ...rest } = r;
    return { ...rest, proofs, withAccount: !!userId, formFields: Array.isArray(event.registrationFields) ? event.registrationFields : [] };
  });

  /** Ver el comprobante (imagen o PDF). Solo personal con permiso; nunca se sirve de forma pública. */
  app.get("/:id/proofs/:proofId/file", { preHandler: review }, async (req, reply) => {
    const { eventId, id, proofId } = idParam.extend({ proofId: z.string().uuid() }).parse(req.params);
    await loadEvent(req, eventId);
    const proof = await prisma.paymentProof.findFirst({ where: { id: proofId, registrationId: id, registration: { eventId } } });
    if (!proof) throw notFound("Comprobante no encontrado.");
    const stream = await openProof(proof.storageKey);
    reply.header("Content-Type", proof.mimeType);
    reply.header("Content-Disposition", `inline; filename="comprobante-${proof.id.slice(0, 8)}.${proof.storageKey.split(".").pop()}"`);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    reply.header("Cache-Control", "private, no-store");
    return reply.send(stream);
  });

  /**
   * Confirmar el pago: crea al participante en el listado oficial con su número y su QR, deja la credencial
   * disponible y conserva el mismo acceso del peregrino (su sesión pasa a ser la de un participante verificado).
   */
  app.post("/:id/approve", { preHandler: review }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    const event = await loadEventWith(req, eventId, "REGISTRATION");
    const body = approveRegistrationSchema.parse(req.body ?? {});
    if (event.status === "FINISHED" || event.status === "CANCELLED") throw new AppError(409, "EVENT_CLOSED", "El evento ya no admite nuevos participantes.");

    const participant = await prisma.$transaction(async (tx) => {
      await lockEvent(tx, eventId);
      const reg = await tx.registration.findFirst({ where: { id, eventId } });
      if (!reg) throw notFound("Inscripción no encontrada.");
      if (reg.status === "APPROVED") throw new AppError(409, "ALREADY_APPROVED", "Esta inscripción ya fue confirmada.");
      if (reg.status === "CANCELLED") throw new AppError(409, "CANCELLED", "Esta inscripción fue cancelada.");
      // A4: REJECTED → APPROVED no existe. Una rechazada vuelve a revisión (REJECTED → IN_REVIEW) con un comprobante nuevo.
      if (reg.status === "REJECTED") {
        throw new AppError(409, "REGISTRATION_REJECTED", "Esta inscripción fue rechazada: para aprobarla debe volver a revisión con un comprobante nuevo.");
      }
      if (reg.status !== "IN_REVIEW" && !body.withoutProof) {
        throw new AppError(409, "NO_PROOF", "Todavía no envió comprobante. Si pagó en efectivo, confirma indicando que es sin comprobante.");
      }
      if (await tx.participant.findUnique({ where: { eventId_documentNumber: { eventId, documentNumber: reg.documentNumber } } })) {
        throw new AppError(409, "DUPLICATE_DOCUMENT", "Ya existe un participante oficial con ese documento.");
      }
      // A4: el cupo se comprueba y se reserva dentro del bloqueo del evento: dos aprobaciones simultáneas
      // se serializan y nunca superan capacity. Solo cuentan los participantes ACTIVE.
      await assertCapacityFor(tx, eventId, 1);
      let number = body.number;
      if (number) {
        if (await tx.participant.findFirst({ where: { eventId, number } })) throw new AppError(409, "DUPLICATE_NUMBER", `El número ${number} ya está en uso.`);
      } else {
        number = ((await tx.participant.aggregate({ where: { eventId }, _max: { number: true } }))._max.number ?? 0) + 1;
      }
      const now = new Date();
      const p = await tx.participant.create({
        data: {
          // A4a: la participación oficial es de la misma Person que se inscribió.
          eventId, personId: reg.personId, number, firstName: reg.firstName, lastName: reg.lastName, documentNumber: reg.documentNumber, documentType: reg.documentType,
          phone: reg.phone, phoneDigits: reg.phoneDigits, qrToken: newQrToken(),
          accessTokenHash: reg.accessTokenHash, accessCodeHash: reg.accessCodeHash, accessIssuedAt: now, credentialIssuedAt: now,
        },
      });
      // A4: transición condicional sobre el estado leído; si un rechazo simultáneo lo cambió, se revierte todo.
      const claimed = await tx.registration.updateMany({
        where: { id, status: reg.status },
        data: { status: "APPROVED", participantId: p.id, reviewedById: req.auth.id, reviewedAt: now, rejectionReason: null, accessTokenHash: null, accessCodeHash: null },
      });
      if (claimed.count !== 1) throw new AppError(409, "REGISTRATION_CHANGED", "La inscripción cambió de estado. Vuelve a consultarla.");
      await tx.paymentProof.updateMany({ where: { registrationId: id, status: "SUBMITTED" }, data: { status: "ACCEPTED", reviewedAt: now } });
      await tx.pilgrimSession.updateMany({ where: { registrationId: id }, data: { participantId: p.id, registrationId: null } });
      return p;
    });
    await audit(req, {
      action: "REGISTRATION_APPROVED", entityType: "Registration", entityId: id, eventId,
      metadata: { participantId: participant.id, number: participant.number, withoutProof: body.withoutProof },
    });
    publish(eventId, { type: "registration.updated", data: { registrationId: id, status: "APPROVED" } });
    publish(eventId, { type: "participants.changed", data: { participantId: participant.id } });
    return { participantId: participant.id, number: participant.number, credentialReady: true };
  });

  app.post("/:id/reject", { preHandler: review }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEventWith(req, eventId, "REGISTRATION");
    const { reason } = rejectRegistrationSchema.parse(req.body);
    const reg = await prisma.registration.findFirst({ where: { id, eventId } });
    if (!reg) throw notFound("Inscripción no encontrada.");
    if (reg.status === "APPROVED" || reg.status === "CANCELLED") throw new AppError(409, "NOT_REVIEWABLE", "Esta inscripción ya no se puede rechazar.");
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // A4: transición condicional. Una aprobación simultánea no puede quedar pisada por un rechazo.
      const claimed = await tx.registration.updateMany({
        where: { id, eventId, status: { in: ["PENDING_PROOF", "IN_REVIEW", "REJECTED"] } },
        data: { status: "REJECTED", rejectionReason: reason, reviewedById: req.auth.id, reviewedAt: now },
      });
      if (claimed.count !== 1) throw new AppError(409, "NOT_REVIEWABLE", "Esta inscripción ya no se puede rechazar.");
      await tx.paymentProof.updateMany({ where: { registrationId: id, status: "SUBMITTED" }, data: { status: "REJECTED", reviewedAt: now } });
    });
    await audit(req, { action: "REGISTRATION_REJECTED", entityType: "Registration", entityId: id, eventId, metadata: { reason } });
    publish(eventId, { type: "registration.updated", data: { registrationId: id, status: "REJECTED" } });
    return { ok: true };
  });

  /**
   * A4: el personal reabre una inscripción rechazada (REJECTED → IN_REVIEW), por ejemplo un pago en efectivo.
   * Con motivo, condicional y auditada en la misma transacción. Nunca aprueba: la aprobación sigue pasando por IN_REVIEW.
   */
  app.post("/:id/reopen", { preHandler: review }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    const event = await loadEventWith(req, eventId, "REGISTRATION");
    if (event.status === "FINISHED" || event.status === "CANCELLED") throw new AppError(409, "EVENT_CLOSED", "El evento ya no admite nuevos participantes.");
    const { reason } = reopenRegistrationSchema.parse(req.body);
    await prisma.$transaction(async (tx) => {
      const r = await tx.registration.updateMany({
        where: { id, eventId, status: "REJECTED" },
        data: { status: "IN_REVIEW", rejectionReason: null, reviewedById: req.auth.id, reviewedAt: new Date() },
      });
      if (r.count !== 1) throw new AppError(409, "NOT_REJECTED", "Solo una inscripción rechazada se puede reabrir.");
      await auditTx(tx, req, { action: "REGISTRATION_REOPENED", entityType: "Registration", entityId: id, eventId, metadata: { reason } });
    });
    publish(eventId, { type: "registration.updated", data: { registrationId: id, status: "IN_REVIEW" } });
    return { ok: true, status: "IN_REVIEW" };
  });
}
