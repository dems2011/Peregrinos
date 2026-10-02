import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { credentialQuerySchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { eventParam, loadEvent } from "../lib/access";
import { buildCredentialsPdf } from "../lib/credential";

const PAGE = 500;

/** Credenciales imprimibles (carnet): parroquia + número + QR. Se generan al vuelo a partir de los datos oficiales. */
export default async function credentialRoutes(app: FastifyInstance) {
  const exportPerm = app.requirePermission("credential:export");

  async function context(eventId: string) {
    const e = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { organization: true } });
    return { parish: e.parishName ?? e.organization.name, eventName: e.name, slug: e.name.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).toLowerCase() || "evento" };
  }

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
   * PDF A4 con 10 credenciales por hoja (carnet de 85,6 × 54 mm, listo para recortar).
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
      ctx.parish, ctx.eventName,
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
    const pdf = await buildCredentialsPdf([{ number: p.number, qrToken: p.qrToken, name: includeName === "true" || includeName === "1" ? `${p.firstName} ${p.lastName}` : undefined }], ctx.parish, ctx.eventName);
    await audit(req, { action: "CREDENTIAL_EXPORTED", entityType: "Participant", entityId: id, eventId, metadata: { number: p.number } });
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="credencial-${String(p.number).padStart(3, "0")}.pdf"`);
    reply.header("Cache-Control", "private, no-store");
    return reply.send(pdf);
  });
}
