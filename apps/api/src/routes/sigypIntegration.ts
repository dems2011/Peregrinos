import type { FastifyInstance, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { SIGYP_CONTRACT_VERSION, sigypAnnouncementSchema, sigypProfileSchema, sigypWithdrawSchema, type SigypScope } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { auditTx } from "../lib/audit";
import { AppError, forbidden, unauthorized } from "../lib/errors";
import { bearerSigypToken, hashSigypToken, sameHash, versionOutcome } from "../lib/sigyp";

const sourceParam = z.object({ sourceId: z.string().uuid() });
const SOURCE = "SIGYP";

interface SigypClient { id: string; organizationId: string; scopes: string[]; organization: { id: string; code: string; name: string; status: string } }

/**
 * SIGyP → Peregrinos, contrato v1 (prefijo /api/integrations/sigyp/v1). NO usa sesiones de usuario: cada solicitud trae
 * la credencial de integración de UNA organización y la organización sale SIEMPRE de esa credencial (nunca del
 * contenido), así un SIGyP no puede escribir en otra parroquia. Solo se aceptan los campos del contrato (esquemas
 * estrictos). Cada elemento se aplica solo si su versión es mayor que la guardada: los reintentos no duplican.
 */
export default async function sigypIntegrationRoutes(app: FastifyInstance) {
  const rl = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

  async function client(req: FastifyRequest, scope?: SigypScope): Promise<SigypClient> {
    const token = bearerSigypToken(req.headers.authorization);
    if (!token) throw unauthorized("Credencial de integración ausente o con formato inválido.");
    const hash = hashSigypToken(token);
    const c = await prisma.integrationClient.findUnique({
      where: { tokenHash: hash },
      select: { id: true, tokenHash: true, organizationId: true, scopes: true, revokedAt: true, kind: true, lastUsedAt: true, organization: { select: { id: true, code: true, name: true, status: true } } },
    });
    if (!c || c.revokedAt || c.kind !== SOURCE || !sameHash(c.tokenHash, hash)) throw unauthorized("Credencial de integración inválida o revocada.");
    if (scope && !c.scopes.includes(scope)) throw forbidden("La credencial no tiene permiso para esta operación.");
    if (scope && c.organization.status !== "APPROVED") throw new AppError(403, "ORG_NOT_APPROVED", "La organización no está aprobada en Peregrinos.");
    if (!c.lastUsedAt || Date.now() - c.lastUsedAt.getTime() > 5 * 60_000) {
      await prisma.integrationClient.update({ where: { id: c.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
    return c;
  }

  app.get("/whoami", rl(30), async (req) => {
    const c = await client(req);
    return { contract: SIGYP_CONTRACT_VERSION, organizationId: c.organization.id, code: c.organization.code, name: c.organization.name, status: c.organization.status, scopes: c.scopes };
  });

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
}
