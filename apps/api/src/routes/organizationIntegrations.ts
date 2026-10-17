import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SIGYP_SCOPES } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { newSigypToken } from "../lib/sigyp";

const idParam = z.object({ id: z.string().uuid() });
const createBody = z.object({ label: z.string().trim().min(3).max(80).default("SIGyP") }).strict();
const MAX_ACTIVE = 3;

/**
 * Credenciales de integración con SIGyP (prefijo /api/organization/integrations/sigyp). Permiso parish:profile (el
 * mismo del perfil público) y segundo factor reciente. La credencial se muestra UNA sola vez; revocar corta de inmediato.
 */
export default async function organizationIntegrationRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("parish:profile");

  app.get("/", { preHandler: manage }, async (req) => {
    const [items, org] = await Promise.all([
      prisma.integrationClient.findMany({
        where: { organizationId: req.auth.organizationId, kind: "SIGYP" }, orderBy: { createdAt: "desc" },
        select: { id: true, label: true, tokenHint: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true },
      }),
      prisma.organization.findUniqueOrThrow({ where: { id: req.auth.organizationId }, select: { id: true, profileSource: true, profileSyncedVersion: true, profileSyncedAt: true } }),
    ]);
    return { organizationId: org.id, profileSource: org.profileSource, profileSyncedVersion: org.profileSyncedVersion, profileSyncedAt: org.profileSyncedAt, items: items.map((i) => ({ ...i, tokenHint: `…${i.tokenHint}` })) };
  });

  app.post("/", { preHandler: [manage, app.requireRecentMfa], config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const { label } = createBody.parse(req.body ?? {});
    const active = await prisma.integrationClient.count({ where: { organizationId: req.auth.organizationId, kind: "SIGYP", revokedAt: null } });
    if (active >= MAX_ACTIVE) throw new AppError(409, "TOO_MANY_CLIENTS", `Ya hay ${MAX_ACTIVE} credenciales activas: revoca una antes de crear otra.`);
    const t = newSigypToken();
    const c = await prisma.integrationClient.create({
      data: { organizationId: req.auth.organizationId, kind: "SIGYP", label, tokenHash: t.hash, tokenHint: t.hint, scopes: [...SIGYP_SCOPES], createdById: req.auth.id },
    });
    await audit(req, { action: "SIGYP_CLIENT_CREATED", entityType: "IntegrationClient", entityId: c.id, metadata: { label, tokenHint: t.hint, scopes: c.scopes } });
    // Única vez que la credencial sale del servidor.
    return reply.status(201).header("Cache-Control", "no-store").send({ id: c.id, token: t.token, scopes: c.scopes, organizationId: req.auth.organizationId });
  });

  app.post("/:id/revoke", { preHandler: [manage, app.requireRecentMfa] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const r = await prisma.integrationClient.updateMany({ where: { id, organizationId: req.auth.organizationId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: req.auth.id } });
    if (r.count !== 1) throw notFound("Credencial no encontrada o ya revocada.");
    await audit(req, { action: "SIGYP_CLIENT_REVOKED", entityType: "IntegrationClient", entityId: id });
    return { ok: true };
  });

  /**
   * Volver a editar el perfil desde Peregrinos: deja de considerarse administrado por SIGyP. Si SIGyP sigue publicando,
   * lo volverá a tomar en su próxima publicación (revoca la credencial para impedirlo).
   */
  app.post("/release-profile", { preHandler: [manage, app.requireRecentMfa] }, async (req) => {
    const r = await prisma.organization.updateMany({ where: { id: req.auth.organizationId, profileSource: "SIGYP" }, data: { profileSource: null } });
    if (r.count !== 1) throw new AppError(409, "NOT_MANAGED", "El perfil no está administrado por SIGyP.");
    await audit(req, { action: "SIGYP_PROFILE_RELEASED", entityType: "Organization", entityId: req.auth.organizationId });
    return { ok: true };
  });
}
