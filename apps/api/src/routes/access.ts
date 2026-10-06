import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { issueAccessSchema } from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { notFound } from "../lib/errors";
import { eventParam, loadEvent, loadEventWith } from "../lib/access";
import { formatCode, hashAccess, newAccessCode, newAccessToken } from "../lib/pilgrim";

const linkFor = (token: string) => `${cfg.WEB_ORIGIN}/p/${token}`;

/** Celda CSV segura: evita que Excel interprete texto como fórmula (=, +, -, @). Los teléfonos se dejan intactos. */
function csvCell(v: string | number) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^\+?[\d\s()-]+$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Acceso de los peregrinos. Del enlace y del código solo se guarda el hash, así que se muestran UNA vez al emitirlos
 * (para enviarlos o imprimirlos). Si se pierden, se reemiten.
 */
export default async function accessRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("participant:manage");

  app.get("/status", { preHandler: manage }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const [total, withAccess] = await Promise.all([
      prisma.participant.count({ where: { eventId, status: "ACTIVE" } }),
      prisma.participant.count({ where: { eventId, status: "ACTIVE", accessTokenHash: { not: null } } }),
    ]);
    return { total, withAccess, without: total - withAccess };
  });

  /**
   * Emite enlaces + códigos. Sin `participantIds`: a todos los activos que aún no tienen acceso.
   * Con `reissue: true`: reemite aunque ya tengan (el enlace anterior y sus sesiones dejan de funcionar).
   * ?format=csv descarga la lista lista para enviar o imprimir.
   */
  // A6 (§8.2): emitir enlaces personales en lote es una exportación de datos personales → step-up.
  app.post("/issue", { preHandler: [manage, app.requireRecentMfa] }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEventWith(req, eventId, "PARTICIPANTS");
    const body = issueAccessSchema.parse(req.body ?? {});
    const format = z.enum(["json", "csv"]).default("json").parse((req.query as { format?: string }).format);

    const targets = await prisma.participant.findMany({
      where: {
        eventId, status: "ACTIVE",
        ...(body.participantIds && { id: { in: body.participantIds } }),
        ...(!body.reissue && { accessTokenHash: null }),
      },
      orderBy: { number: "asc" }, take: 5000,
    });

    const issued = targets.map((p) => {
      const token = newAccessToken(), code = newAccessCode();
      return { p, token, code };
    });
    for (let i = 0; i < issued.length; i += 100) {
      await prisma.$transaction(
        issued.slice(i, i + 100).map(({ p, token, code }) =>
          prisma.participant.update({ where: { id: p.id }, data: { accessTokenHash: hashAccess(token), accessCodeHash: hashAccess(code), accessIssuedAt: new Date() } }),
        ),
      );
    }
    const reissuedIds = issued.filter(({ p }) => p.accessTokenHash).map(({ p }) => p.id);
    if (reissuedIds.length) {
      await prisma.pilgrimSession.updateMany({ where: { participantId: { in: reissuedIds }, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(req, { action: "PILGRIM_ACCESS_ISSUED", entityType: "Event", entityId: eventId, eventId, metadata: { count: issued.length, reissued: reissuedIds.length } });

    const items = issued.map(({ p, token, code }) => ({
      participantId: p.id, number: p.number, firstName: p.firstName, lastName: p.lastName, phone: p.phone, link: linkFor(token), code: formatCode(code),
    }));
    reply.header("Cache-Control", "no-store");
    if (format === "csv") {
      const rows = [["Número", "Nombre", "Apellido", "Teléfono", "Enlace", "Código"], ...items.map((i) => [String(i.number).padStart(3, "0"), i.firstName, i.lastName, i.phone, i.link, i.code])];
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", 'attachment; filename="acceso-peregrinos.csv"');
      return reply.send("\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"));
    }
    return { count: items.length, items };
  });

  /** Reemite el acceso de una persona (p. ej. perdió el enlace). */
  app.post("/participants/:id/reissue", { preHandler: manage }, async (req, reply) => {
    const { eventId, id } = eventParam.extend({ id: z.string().uuid() }).parse(req.params);
    await loadEventWith(req, eventId, "PARTICIPANTS");
    const p = await prisma.participant.findFirst({ where: { id, eventId } });
    if (!p) throw notFound("Persona no encontrada.");
    const token = newAccessToken(), code = newAccessCode();
    await prisma.$transaction([
      prisma.participant.update({ where: { id }, data: { accessTokenHash: hashAccess(token), accessCodeHash: hashAccess(code), accessIssuedAt: new Date() } }),
      prisma.pilgrimSession.updateMany({ where: { participantId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await audit(req, { action: "PILGRIM_ACCESS_REISSUED", entityType: "Participant", entityId: id, eventId, metadata: { number: p.number } });
    reply.header("Cache-Control", "no-store");
    return { participantId: id, number: p.number, link: linkFor(token), code: formatCode(code) };
  });
}
