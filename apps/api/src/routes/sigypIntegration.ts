import type { FastifyInstance, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  SIGYP_CONTRACT_VERSION, sigypAnnouncementSchema, sigypEventSchema, sigypEventWithdrawSchema, sigypLinkCompleteSchema,
  sigypLinkPreviewSchema, sigypNoticeSchema, sigypProfileSchema, sigypWithdrawSchema, type SigypScope,
} from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { auditTx } from "../lib/audit";
import { AppError, forbidden, notFound, unauthorized } from "../lib/errors";
import { bearerSigypToken, hashLinkCode, hashSigypToken, newSigypToken, sameHash, versionOutcome } from "../lib/sigyp";
import { notifyAudiences, pushNotification, resolveAudiences } from "../lib/notifications";
import { readSingleFile } from "../lib/image";
import { contentImageUrls, prepareContentImage, replaceContentImage } from "../lib/contentImages";

const sourceParam = z.object({ sourceId: z.string().uuid() });
const SOURCE = "SIGYP";
/** Lo que se comparte con cada alcance (se muestra antes de confirmar la vinculación, en ambos sistemas). */
const SHARES: Record<string, string> = {
  "announcements:write": "Cartelera: avisos públicos con vigencia",
  "profile:write": "Datos públicos del perfil (descripción, contacto, canales y horarios)",
  "events:write": "Eventos públicos de la parroquia (sin inscripciones ni datos de participantes)",
  "notices:send": "Avisos a seguidores y al personal de la parroquia (sin acceso a sus datos)",
};

interface SigypClient { id: string; organizationId: string; scopes: string[]; createdById: string | null; organization: { id: string; code: string; name: string; status: string; timezone: string } }

/**
 * SIGyP → Peregrinos, contrato v1 (prefijo /api/integrations/sigyp/v1). NO usa sesiones de usuario: cada solicitud trae
 * la credencial de integración de UNA organización y la organización sale SIEMPRE de esa credencial (nunca del
 * contenido), así un SIGyP no puede escribir en otra parroquia. Solo se aceptan los campos del contrato (esquemas
 * estrictos). Cada elemento se aplica solo si su versión es mayor que la guardada: los reintentos no duplican.
 * La vinculación se completa con un código de UN solo uso que generó el SUPERADMIN de la parroquia.
 */
export default async function sigypIntegrationRoutes(app: FastifyInstance) {
  const rl = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

  async function client(req: FastifyRequest, scope?: SigypScope): Promise<SigypClient> {
    const token = bearerSigypToken(req.headers.authorization);
    if (!token) throw unauthorized("Credencial de integración ausente o con formato inválido.");
    const hash = hashSigypToken(token);
    const c = await prisma.integrationClient.findUnique({
      where: { tokenHash: hash },
      select: { id: true, tokenHash: true, organizationId: true, scopes: true, revokedAt: true, kind: true, lastUsedAt: true, createdById: true, organization: { select: { id: true, code: true, name: true, status: true, timezone: true } } },
    });
    if (!c || c.revokedAt || c.kind !== SOURCE || !sameHash(c.tokenHash, hash)) throw unauthorized("Credencial de integración inválida o revocada.");
    if (scope && !c.scopes.includes(scope)) throw forbidden("La credencial no tiene permiso para esta operación.");
    if (scope && c.organization.status !== "APPROVED") throw new AppError(403, "ORG_NOT_APPROVED", "La organización no está aprobada en Peregrinos.");
    if (!c.lastUsedAt || Date.now() - c.lastUsedAt.getTime() > 5 * 60_000) {
      await prisma.integrationClient.update({ where: { id: c.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
    return c;
  }

  /* ---------- Vinculación ---------- */

  const usableCode = async (raw: string) => {
    const hash = hashLinkCode(raw);
    const code = hash ? await prisma.integrationLinkCode.findUnique({ where: { codeHash: hash }, include: { organization: { select: { id: true, code: true, name: true, status: true } } } }) : null;
    // Mismo mensaje para «no existe», «vencido», «usado» y «revocado»: no se revela cuál.
    if (!code || code.usedAt || code.revokedAt || code.expiresAt.getTime() <= Date.now()) throw notFound("Código de vinculación inválido, vencido o ya usado.");
    return { hash: hash!, code };
  };

  /** Vista previa SIN consumir el código: qué parroquia se vinculará, qué se compartirá y hasta cuándo vale. */
  app.post("/link/preview", rl(10), async (req) => {
    const { code: raw } = sigypLinkPreviewSchema.parse(req.body);
    const { code } = await usableCode(raw);
    return {
      contract: SIGYP_CONTRACT_VERSION, organization: code.organization, scopes: code.scopes,
      shares: code.scopes.map((s) => SHARES[s] ?? s), expiresAt: code.expiresAt,
    };
  });

  /** Completar: consume el código (una sola vez, en la misma sentencia) y entrega la credencial UNA vez. */
  app.post("/link/complete", rl(10), async (req, reply) => {
    const v = sigypLinkCompleteSchema.parse(req.body);
    const { hash, code } = await usableCode(v.code);
    const t = newSigypToken();
    const label = `SIGyP ${v.installation.parishCode} — ${v.installation.label}`.slice(0, 80);
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.integrationLinkCode.updateMany({ where: { codeHash: hash, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date(), usedLabel: label } });
      if (claimed.count !== 1) throw notFound("Código de vinculación inválido, vencido o ya usado.");
      const c = await tx.integrationClient.create({
        data: { organizationId: code.organizationId, kind: SOURCE, label, tokenHash: t.hash, tokenHint: t.hint, scopes: code.scopes, createdById: code.createdById },
      });
      await tx.integrationLinkCode.update({ where: { codeHash: hash }, data: { usedClientId: c.id } });
      await auditTx(tx, req, { action: "SIGYP_LINK_COMPLETED", entityType: "IntegrationClient", entityId: c.id, organizationId: code.organizationId, userId: null, metadata: { linkCodeId: code.id, label, scopes: code.scopes } });
      return c;
    });
    return reply.status(201).header("Cache-Control", "no-store").send({
      contract: SIGYP_CONTRACT_VERSION, token: t.token, organization: code.organization, scopes: result.scopes,
    });
  });

  /** Desvincular desde SIGyP: revoca la propia credencial (deja de aceptarse de inmediato). No borra nada publicado. */
  app.post("/unlink", rl(10), async (req) => {
    const c = await client(req);
    await prisma.$transaction(async (tx) => {
      await tx.integrationClient.update({ where: { id: c.id }, data: { revokedAt: new Date() } });
      await auditTx(tx, req, { action: "SIGYP_CLIENT_REVOKED_BY_SIGYP", entityType: "IntegrationClient", entityId: c.id, organizationId: c.organizationId, userId: null });
    });
    return { ok: true };
  });

  app.get("/whoami", rl(30), async (req) => {
    const c = await client(req);
    return { contract: SIGYP_CONTRACT_VERSION, organizationId: c.organization.id, code: c.organization.code, name: c.organization.name, status: c.organization.status, scopes: c.scopes };
  });

  /* ---------- Cartelera ---------- */

  app.put("/announcements/:sourceId", rl(120), async (req) => {
    const c = await client(req, "announcements:write");
    const { sourceId } = sourceParam.parse(req.params);
    const v = sigypAnnouncementSchema.parse(req.body);
    if (v.sourceId !== sourceId) throw new AppError(409, "SOURCE_MISMATCH", "El identificador del aviso no coincide con la ruta.");
    const data = {
      version: v.version, title: v.title, body: v.body, category: v.category, startsAt: new Date(v.startsAt),
      endsAt: v.endsAt ? new Date(v.endsAt) : null, publishedAt: new Date(v.publishedAt), withdrawnAt: null,
    };
    const key = { organizationId_sourceSystem_sourceId: { organizationId: c.organizationId, sourceSystem: SOURCE, sourceId } };
    const outcome = await prisma.$transaction(async (tx) => {
      const cur = await tx.parishAnnouncement.findUnique({ where: key, select: { version: true } });
      if (versionOutcome(cur?.version, v.version) === "stale") return "stale" as const;
      if (cur) {
        // Condición en la base: si otra solicitud aplicó una versión igual o mayor en paralelo, esta no pisa nada.
        const r = await tx.parishAnnouncement.updateMany({ where: { organizationId: c.organizationId, sourceSystem: SOURCE, sourceId, version: { lt: v.version } }, data });
        if (r.count !== 1) return "stale" as const;
      } else {
        try { await tx.parishAnnouncement.create({ data: { organizationId: c.organizationId, sourceSystem: SOURCE, sourceId, ...data } }); } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "stale" as const;
          throw e;
        }
      }
      await auditTx(tx, req, { action: "SIGYP_ANNOUNCEMENT_APPLIED", entityType: "ParishAnnouncement", entityId: sourceId, organizationId: c.organizationId, userId: null, metadata: { version: v.version, clientId: c.id } });
      return "applied" as const;
    });
    return { status: outcome, version: v.version };
  });

  app.post("/announcements/:sourceId/withdraw", rl(120), async (req) => {
    const c = await client(req, "announcements:write");
    const { sourceId } = sourceParam.parse(req.params);
    const v = sigypWithdrawSchema.parse(req.body);
    if (v.sourceId !== sourceId) throw new AppError(409, "SOURCE_MISMATCH", "El identificador del aviso no coincide con la ruta.");
    const outcome = await prisma.$transaction(async (tx) => {
      const r = await tx.parishAnnouncement.updateMany({ where: { organizationId: c.organizationId, sourceSystem: SOURCE, sourceId, version: { lt: v.version } }, data: { version: v.version, withdrawnAt: new Date() } });
      if (r.count !== 1) {
        // Nunca existió aquí (no hay nada visible que retirar) o ya hay una versión igual o mayor.
        const exists = await tx.parishAnnouncement.findUnique({ where: { organizationId_sourceSystem_sourceId: { organizationId: c.organizationId, sourceSystem: SOURCE, sourceId } }, select: { id: true } });
        return exists ? ("stale" as const) : ("applied" as const);
      }
      await auditTx(tx, req, { action: "SIGYP_ANNOUNCEMENT_WITHDRAWN", entityType: "ParishAnnouncement", entityId: sourceId, organizationId: c.organizationId, userId: null, metadata: { version: v.version, clientId: c.id } });
      return "applied" as const;
    });
    return { status: outcome, version: v.version };
  });

  /* ---------- Perfil ---------- */

  app.put("/profile", rl(30), async (req) => {
    const c = await client(req, "profile:write");
    const v = sigypProfileSchema.parse(req.body);
    const outcome = await prisma.$transaction(async (tx) => {
      const r = await tx.organization.updateMany({
        where: { id: c.organizationId, profileSyncedVersion: { lt: v.version } },
        data: { ...v.profile, profileSource: SOURCE, profileSyncedVersion: v.version, profileSyncedAt: new Date() },
      });
      if (r.count !== 1) return "stale" as const;
      await auditTx(tx, req, { action: "SIGYP_PROFILE_APPLIED", entityType: "Organization", entityId: c.organizationId, organizationId: c.organizationId, userId: null, metadata: { version: v.version, clientId: c.id, fields: Object.keys(v.profile) } });
      return "applied" as const;
    });
    return { status: outcome, version: v.version };
  });

  /* ---------- Eventos (modelo Event de Peregrinos; solo información y lugar, sin inscripciones) ---------- */

  app.put("/events/:sourceId", rl(60), async (req) => {
    const c = await client(req, "events:write");
    const { sourceId } = sourceParam.parse(req.params);
    const v = sigypEventSchema.parse(req.body);
    if (v.sourceId !== sourceId) throw new AppError(409, "SOURCE_MISMATCH", "El identificador del evento no coincide con la ruta.");
    const hasLocation = v.attendanceMode !== "ONLINE" && (v.locationName !== null || v.address !== null);
    const data = {
      name: v.title, description: v.description, type: v.eventType, startsAt: new Date(v.startsAt), endsAt: v.endsAt ? new Date(v.endsAt) : null,
      timezone: v.timezone, locationName: hasLocation ? v.locationName : null, address: hasLocation ? v.address : null, latitude: null, longitude: null,
      attendanceMode: v.attendanceMode, onlineUrl: v.onlineUrl, visibility: v.visibility, status: "SCHEDULED" as const,
      // Solo información (+ lugar): nada de inscripciones, participantes, controles ni certificados desde SIGyP.
      capabilities: hasLocation ? (["INFO", "LOCATION"] as const) : (["INFO"] as const),
      registrationOpen: false, certificateEnabled: false, sourceVersion: v.version,
    };
    const outcome = await prisma.$transaction(async (tx) => {
      const cur = await tx.event.findUnique({ where: { organizationId_sourceSystem_sourceId: { organizationId: c.organizationId, sourceSystem: SOURCE, sourceId } }, select: { id: true, sourceVersion: true } });
      if (versionOutcome(cur?.sourceVersion, v.version) === "stale") return { status: "stale" as const, eventId: cur?.id ?? null };
      let eventId: string;
      if (cur) {
        const r = await tx.event.updateMany({ where: { id: cur.id, sourceVersion: { lt: v.version } }, data: { ...data, capabilities: [...data.capabilities] } });
        if (r.count !== 1) return { status: "stale" as const, eventId: cur.id };
        eventId = cur.id;
      } else {
        try {
          const e = await tx.event.create({
            // publishedNotifiedAt: publicar desde SIGyP NO avisa a los seguidores (los avisos se envían aparte, a propósito).
            data: { ...data, capabilities: [...data.capabilities], organizationId: c.organizationId, sourceSystem: SOURCE, sourceId, publishedNotifiedAt: new Date() },
            select: { id: true },
          });
          eventId = e.id;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { status: "stale" as const, eventId: null };
          throw e;
        }
      }
      await auditTx(tx, req, { action: "SIGYP_EVENT_APPLIED", entityType: "Event", entityId: eventId, eventId, organizationId: c.organizationId, userId: null, metadata: { version: v.version, sourceId, clientId: c.id } });
      return { status: "applied" as const, eventId };
    });
    return { ...outcome, version: v.version };
  });

  /** Retirar: el evento queda CANCELADO (no se muestra en el perfil). Nada se borra. */
  app.post("/events/:sourceId/withdraw", rl(60), async (req) => {
    const c = await client(req, "events:write");
    const { sourceId } = sourceParam.parse(req.params);
    const v = sigypEventWithdrawSchema.parse(req.body);
    if (v.sourceId !== sourceId) throw new AppError(409, "SOURCE_MISMATCH", "El identificador del evento no coincide con la ruta.");
    const outcome = await prisma.$transaction(async (tx) => {
      const cur = await tx.event.findUnique({ where: { organizationId_sourceSystem_sourceId: { organizationId: c.organizationId, sourceSystem: SOURCE, sourceId } }, select: { id: true } });
      if (!cur) return "applied" as const; // nunca llegó: no hay nada visible que retirar
      const r = await tx.event.updateMany({ where: { id: cur.id, sourceVersion: { lt: v.version } }, data: { status: "CANCELLED", sourceVersion: v.version } });
      if (r.count !== 1) return "stale" as const;
      await tx.locationShare.deleteMany({ where: { eventId: cur.id } });
      await auditTx(tx, req, { action: "SIGYP_EVENT_WITHDRAWN", entityType: "Event", entityId: cur.id, eventId: cur.id, organizationId: c.organizationId, userId: null, metadata: { version: v.version, sourceId, clientId: c.id } });
      return "applied" as const;
    });
    return { status: outcome, version: v.version };
  });

  /** Portada del evento (multipart, un archivo). Misma validación y variantes WebP sin metadatos que el panel. */
  app.put("/events/:sourceId/cover", { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req) => {
    const c = await client(req, "events:write");
    const { sourceId } = sourceParam.parse(req.params);
    const ev = await prisma.event.findUnique({ where: { organizationId_sourceSystem_sourceId: { organizationId: c.organizationId, sourceSystem: SOURCE, sourceId } }, select: { id: true } });
    if (!ev) throw notFound("El evento todavía no existe en Peregrinos.");
    // La imagen queda atribuida a quien autorizó la vinculación (el SUPERADMIN que generó el código).
    const author = c.createdById;
    if (!author) throw new AppError(409, "CLIENT_WITHOUT_AUTHOR", "Esta credencial no tiene un responsable asociado: vuelve a vincular con un código.");
    const images = await prepareContentImage("EVENT_COVER", await readSingleFile(req));
    await prisma.$transaction(async (tx) => {
      await replaceContentImage(tx, { organizationId: c.organizationId, ownerType: "EVENT_COVER", ownerId: ev.id, createdById: author, images });
      await auditTx(tx, req, { action: "SIGYP_EVENT_COVER_APPLIED", entityType: "Event", entityId: ev.id, eventId: ev.id, organizationId: c.organizationId, userId: null, metadata: { sha256: images[0].sha256, bytes: images[0].sizeBytes } });
    });
    return { status: "applied", cover: await contentImageUrls("EVENT_COVER", ev.id) };
  });

  /* ---------- Avisos multigrupo ---------- */

  /** Cuántas personas hay en cada grupo (solo números: nunca nombres, correos ni dispositivos). */
  app.get("/notices/audiences", rl(30), async (req) => {
    const c = await client(req, "notices:send");
    const r = await resolveAudiences(prisma, c.organizationId, ["FOLLOWERS", "STAFF:SUPERADMIN", "STAFF:ADMIN", "STAFF:OPERATOR"]);
    return { counts: r.counts };
  });

  /** Enviar un aviso: se crea UNA vez por (organización, sourceId); un reintento devuelve el ya creado sin reenviar. */
  app.post("/notices/:sourceId", rl(10), async (req) => {
    const c = await client(req, "notices:send");
    const { sourceId } = sourceParam.parse(req.params);
    const v = sigypNoticeSchema.parse(req.body);
    if (v.sourceId !== sourceId) throw new AppError(409, "SOURCE_MISMATCH", "El identificador del aviso no coincide con la ruta.");
    const existing = await prisma.notification.findUnique({ where: { organizationId_sourceSystem_sourceId: { organizationId: c.organizationId, sourceSystem: SOURCE, sourceId } }, select: { id: true, recipientCount: true } });
    if (existing) return { status: "stale", recipientCount: existing.recipientCount };
    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        const r = await notifyAudiences(tx, { organizationId: c.organizationId, audiences: v.audiences, title: v.title, body: v.body, delivery: v.delivery, sourceSystem: SOURCE, sourceId });
        await auditTx(tx, req, { action: "SIGYP_NOTICE_SENT", entityType: "Notification", entityId: r.notification.id, organizationId: c.organizationId, userId: null, metadata: { sourceId, audiences: v.audiences, delivery: v.delivery, recipients: r.notification.recipientCount, counts: r.counts } });
        return r.notification;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const n = await prisma.notification.findUniqueOrThrow({ where: { organizationId_sourceSystem_sourceId: { organizationId: c.organizationId, sourceSystem: SOURCE, sourceId } }, select: { recipientCount: true } });
        return { status: "stale", recipientCount: n.recipientCount };
      }
      throw e;
    }
    if (created.delivery === "PUSH") void pushNotification(created);
    return { status: "applied", recipientCount: created.recipientCount };
  });
}
