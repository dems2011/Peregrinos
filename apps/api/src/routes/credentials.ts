import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { CREDENTIAL_SPEC, credentialQuerySchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { eventParam, loadEvent } from "../lib/access";
import { buildCredentialsPdf } from "../lib/credential";
import { readSingleFile, validateImage } from "../lib/image";

const PAGE = 500;

/** Credenciales imprimibles (carnet): parroquia + número + QR. Se generan al vuelo a partir de los datos oficiales. */
export default async function credentialRoutes(app: FastifyInstance) {
  const exportPerm = app.requirePermission("credential:export");

  async function context(eventId: string) {
    const e = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true, parishName: true, credentialMode: true, organization: { select: { name: true } } } });
    // B1: con diseño propio, el fondo subido para este evento (validado al subirlo).
    const bg = e.credentialMode === "CUSTOM"
      ? await prisma.mediaAsset.findFirst({ where: { eventId, kind: "CREDENTIAL_BACKGROUND" }, select: { data: true } })
      : null;
    return {
      parish: e.parishName ?? e.organization.name, eventName: e.name, background: bg ? Buffer.from(bg.data) : null,
      slug: e.name.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).toLowerCase() || "evento",
    };
  }

  /* ---------- B1: diseño de la credencial (estándar o fondo propio) ---------- */
  const design = app.requirePermission("event:update");

  app.get("/design", { preHandler: exportPerm }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    const e = await loadEvent(req, eventId);
    const bg = await prisma.mediaAsset.findFirst({ where: { eventId, kind: "CREDENTIAL_BACKGROUND" }, select: { width: true, height: true, sizeBytes: true, mime: true, createdAt: true } });
    return { mode: e.credentialMode, background: bg, spec: CREDENTIAL_SPEC };
  });

  /** Sube el fondo propio (vertical, proporción CR80). No cambia el modo: se activa al elegir «diseño propio». */
  app.put("/background", { preHandler: design, config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    const e = await loadEvent(req, eventId);
    const buf = await readSingleFile(req);
    const s = CREDENTIAL_SPEC;
    const info = validateImage(buf, {
      label: "Diseño de la credencial", mimes: s.mimes, maxBytes: s.maxBytes, minWidth: s.minPx.width, minHeight: s.minPx.height,
      maxPx: 6000, minRatio: s.ratio * (1 - s.ratioTolerance), maxRatio: s.ratio * (1 + s.ratioTolerance),
    });
    await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.deleteMany({ where: { eventId, kind: "CREDENTIAL_BACKGROUND" } });
      await tx.mediaAsset.create({ data: { organizationId: e.organizationId, eventId, kind: "CREDENTIAL_BACKGROUND", mime: info.mime, width: info.width, height: info.height, sizeBytes: info.size, sha256: info.sha256, data: new Uint8Array(buf), createdById: req.auth.id } });
    });
    await audit(req, { action: "CREDENTIAL_BACKGROUND_UPLOADED", entityType: "Event", entityId: eventId, eventId, metadata: { width: info.width, height: info.height, bytes: info.size } });
    return { background: { width: info.width, height: info.height, sizeBytes: info.size, mime: info.mime } };
  });

  /** Quita el fondo propio: el evento vuelve al diseño estándar. */
  app.delete("/background", { preHandler: design }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    await prisma.$transaction([
      prisma.event.update({ where: { id: eventId }, data: { credentialMode: "STANDARD" } }),
      prisma.mediaAsset.deleteMany({ where: { eventId, kind: "CREDENTIAL_BACKGROUND" } }),
    ]);
    await audit(req, { action: "CREDENTIAL_BACKGROUND_REMOVED", entityType: "Event", entityId: eventId, eventId });
    return { mode: "STANDARD" };
  });

  /** Vista previa (PDF de una credencial de ejemplo, sin datos reales) con el diseño elegido o con ?mode=CUSTOM. */
  app.get("/preview", { preHandler: exportPerm }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const mode = z.enum(["STANDARD", "CUSTOM"]).optional().parse((req.query as { mode?: string }).mode);
    const ctx = await context(eventId);
    if (mode === "STANDARD") ctx.background = null;
    if (mode === "CUSTOM" && !ctx.background) {
      const bg = await prisma.mediaAsset.findFirst({ where: { eventId, kind: "CREDENTIAL_BACKGROUND" }, select: { data: true } });
      if (!bg) throw notFound("Todavía no subiste un diseño propio.");
      ctx.background = Buffer.from(bg.data);
    }
    const pdf = await buildCredentialsPdf([{ number: 7, qrToken: "vista-previa-sin-datos-reales", name: "Nombre Apellido" }], ctx);
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", 'inline; filename="credencial-vista-previa.pdf"');
    reply.header("Cache-Control", "private, no-store");
    return reply.send(pdf);
  });

  app.get("/status", { preHandler: exportPerm }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const where = { eventId, status: "ACTIVE" as const };
    const [total, pendingPrint] = await Promise.all([
      prisma.participant.count({ where }), prisma.participant.count({ where: { ...where, credentialPrintedAt: null } }),
    ]);
    return { total, pendingPrint, printed: total - pendingPrint, pageSize: PAGE };
  });

  /**
   * PDF A4 con 9 credenciales verticales por hoja (CR80 de 54 × 85,6 mm, listo para recortar).
   *   scope=new  → las que aún no se imprimieron (por defecto) · scope=all · scope=ids&ids=uuid,uuid
   *   mark=true  → las marca como impresas · includeName=true → imprime también el nombre
   *   page=N     → lotes de 500 credenciales
   */
  app.get("/", { preHandler: exportPerm }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const q = credentialQuerySchema.parse(req.query);

    let where: Prisma.ParticipantWhereInput = { eventId, status: "ACTIVE" };
    if (q.scope === "new") where = { ...where, credentialPrintedAt: null };
    if (q.scope === "ids") {
      const ids = (q.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!ids.length || ids.some((i) => !z.string().uuid().safeParse(i).success)) throw new AppError(400, "INVALID_IDS", "Indica los identificadores de las personas.");
      where = { ...where, id: { in: ids } };
    }
    const people = await prisma.participant.findMany({ where, orderBy: { number: "asc" }, skip: (q.page - 1) * PAGE, take: PAGE });
    if (!people.length) throw notFound(q.scope === "new" ? "No hay credenciales nuevas para imprimir." : "No hay credenciales para exportar.");

    const ctx = await context(eventId);
    const pdf = await buildCredentialsPdf(
      people.map((p) => ({ number: p.number, qrToken: p.qrToken, name: q.includeName ? `${p.firstName} ${p.lastName}` : undefined })),
      ctx,
    );
    if (q.mark) await prisma.participant.updateMany({ where: { id: { in: people.map((p) => p.id) } }, data: { credentialPrintedAt: new Date() } });
    await audit(req, { action: "CREDENTIALS_EXPORTED", entityType: "Event", entityId: eventId, eventId, metadata: { count: people.length, scope: q.scope, page: q.page, marked: q.mark, includeName: q.includeName } });

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="credenciales-${ctx.slug}-lote${q.page}.pdf"`);
    reply.header("Cache-Control", "private, no-store");
    return reply.send(pdf);
  });

  /** Credencial individual (p. ej. reposición). */
  app.get("/participants/:id", { preHandler: exportPerm }, async (req, reply) => {
    const { eventId, id } = eventParam.extend({ id: z.string().uuid() }).parse(req.params);
    await loadEvent(req, eventId);
    const includeName = z.enum(["true", "false", "1", "0"]).default("false").parse((req.query as { includeName?: string }).includeName ?? "false");
    const p = await prisma.participant.findFirst({ where: { id, eventId } });
    if (!p) throw notFound("Persona no encontrada.");
    const ctx = await context(eventId);
    const pdf = await buildCredentialsPdf([{ number: p.number, qrToken: p.qrToken, name: includeName === "true" || includeName === "1" ? `${p.firstName} ${p.lastName}` : undefined }], ctx);
    await audit(req, { action: "CREDENTIAL_EXPORTED", entityType: "Participant", entityId: id, eventId, metadata: { number: p.number } });
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="credencial-${String(p.number).padStart(3, "0")}.pdf"`);
    reply.header("Cache-Control", "private, no-store");
    return reply.send(pdf);
  });
}
