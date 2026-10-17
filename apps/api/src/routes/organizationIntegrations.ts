import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LINK_CODE_TTL_MINUTES, SIGYP_SCOPES } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, forbidden, notFound } from "../lib/errors";
import { newLinkCode, newSigypToken } from "../lib/sigyp";

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

  /**
   * Código de vinculación de UN solo uso (15 minutos) para completar la vinculación DESDE SIGyP. Solo el SUPERADMIN:
   * así la vinculación demuestra autoridad sobre esta parroquia (un colaborador con parish:profile no basta).
   */
  app.post("/link-codes", { preHandler: [manage, app.requireRecentMfa], config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    if (req.auth.role !== "SUPERADMIN") throw forbidden("Solo el titular de la parroquia (SUPERADMIN) puede vincularla con SIGyP.");
    const active = await prisma.integrationLinkCode.count({ where: { organizationId: req.auth.organizationId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (active >= 3) throw new AppError(409, "TOO_MANY_LINK_CODES", "Ya hay códigos de vinculación vigentes: usa o revoca uno.");
    const { code, hash } = newLinkCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);
    const row = await prisma.integrationLinkCode.create({ data: { organizationId: req.auth.organizationId, codeHash: hash, scopes: [...SIGYP_SCOPES], createdById: req.auth.id, expiresAt } });
    await audit(req, { action: "SIGYP_LINK_CODE_CREATED", entityType: "IntegrationLinkCode", entityId: row.id, metadata: { expiresAt: expiresAt.toISOString(), scopes: row.scopes } });
    return reply.status(201).header("Cache-Control", "no-store").send({ id: row.id, code, expiresAt, scopes: row.scopes });
  });

  app.get("/link-codes", { preHandler: manage }, async (req) => ({
    items: await prisma.integrationLinkCode.findMany({
      where: { organizationId: req.auth.organizationId }, orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, scopes: true, createdAt: true, expiresAt: true, usedAt: true, usedLabel: true, revokedAt: true },
    }),
  }));

  app.post("/link-codes/:id/revoke", { preHandler: [manage, app.requireRecentMfa] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const r = await prisma.integrationLinkCode.updateMany({ where: { id, organizationId: req.auth.organizationId, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (r.count !== 1) throw notFound("Código no encontrado, ya usado o revocado.");
    await audit(req, { action: "SIGYP_LINK_CODE_REVOKED", entityType: "IntegrationLinkCode", entityId: id });
    return { ok: true };
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
