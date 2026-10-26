import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { LINK_CODE_TTL_MINUTES, sigypClientCreateSchema, sigypLinkCodeCreateSchema, sigypReauthSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { AppError, forbidden, notFound } from "../lib/errors";
import { newLinkCode, newSigypToken } from "../lib/sigyp";
import { assertPasswordReauth } from "../lib/reauth";
import { MAX_ACTIVE_LINK_CODES, MAX_ACTIVE_SIGYP_CLIENTS, lockOrganization } from "../lib/integrationLimits";

const idParam = z.object({ id: z.string().uuid() });

/**
 * Credenciales de integración con SIGyP (prefijo /api/organization/integrations/sigyp). Ver y revocar: permiso
 * parish:profile. CONCEDER (código de vinculación o credencial directa): solo el SUPERADMIN, con los alcances que elija
 * de forma explícita y su contraseña en la misma petición (D1/D2); además, segundo factor reciente si la cuenta lo tiene.
 * La credencial y el código se muestran UNA sola vez y solo se guarda su SHA-256; revocar corta de inmediato.
 */
export default async function organizationIntegrationRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("parish:profile");

  /** Solo el titular de la parroquia concede acceso a SIGyP; cualquier otro intento queda auditado. */
  async function requireOwner(req: FastifyRequest, action: string) {
    if (req.auth.role === "SUPERADMIN") return;
    await audit(req, { action: "SIGYP_GRANT_DENIED", entityType: "Organization", entityId: req.auth.organizationId, metadata: { attempted: action, role: req.auth.role } });
    throw forbidden("Solo el titular de la parroquia (SUPERADMIN) puede vincularla con SIGyP o crear credenciales.");
  }

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

  /** Credencial directa (avanzado): solo SUPERADMIN, alcances explícitos, contraseña. Límite de activas bajo bloqueo. */
  app.post("/", { preHandler: [manage, app.requireRecentMfa], config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    await requireOwner(req, "client:create");
    const { label, scopes, password } = sigypClientCreateSchema.parse(req.body ?? {});
    await assertPasswordReauth(req, password, "sigyp:client:create");
    const t = newSigypToken();
    const c = await prisma.$transaction(async (tx) => {
      await lockOrganization(tx, req.auth.organizationId);
      const active = await tx.integrationClient.count({ where: { organizationId: req.auth.organizationId, kind: "SIGYP", revokedAt: null } });
      if (active >= MAX_ACTIVE_SIGYP_CLIENTS) throw new AppError(409, "TOO_MANY_CLIENTS", `Ya hay ${MAX_ACTIVE_SIGYP_CLIENTS} credenciales activas: revoca una antes de crear otra.`);
      const row = await tx.integrationClient.create({
        data: { organizationId: req.auth.organizationId, kind: "SIGYP", label, tokenHash: t.hash, tokenHint: t.hint, scopes, createdById: req.auth.id },
      });
      await auditTx(tx, req, { action: "SIGYP_CLIENT_CREATED", entityType: "IntegrationClient", entityId: row.id, metadata: { label, tokenHint: t.hint, scopes } });
      return row;
    });
    // Única vez que la credencial sale del servidor.
    return reply.status(201).header("Cache-Control", "no-store").send({ id: c.id, token: t.token, scopes: c.scopes, organizationId: req.auth.organizationId });
  });

  /**
   * Código de vinculación de UN solo uso (15 minutos) para completar la vinculación DESDE SIGyP. Solo el SUPERADMIN:
   * así la vinculación demuestra autoridad sobre esta parroquia (un colaborador con parish:profile no basta). Los
   * alcances los elige el titular; la credencial que se entregue al completar tendrá exactamente esos.
   */
  app.post("/link-codes", { preHandler: [manage, app.requireRecentMfa], config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    await requireOwner(req, "link-code:create");
    const { scopes, password } = sigypLinkCodeCreateSchema.parse(req.body ?? {});
    await assertPasswordReauth(req, password, "sigyp:link-code:create");
    const { code, hash } = newLinkCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);
    const row = await prisma.$transaction(async (tx) => {
      await lockOrganization(tx, req.auth.organizationId);
      const active = await tx.integrationLinkCode.count({ where: { organizationId: req.auth.organizationId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (active >= MAX_ACTIVE_LINK_CODES) throw new AppError(409, "TOO_MANY_LINK_CODES", "Ya hay códigos de vinculación vigentes: usa o revoca uno.");
      const r = await tx.integrationLinkCode.create({ data: { organizationId: req.auth.organizationId, codeHash: hash, scopes, createdById: req.auth.id, expiresAt } });
      await auditTx(tx, req, { action: "SIGYP_LINK_CODE_CREATED", entityType: "IntegrationLinkCode", entityId: r.id, metadata: { expiresAt: expiresAt.toISOString(), scopes } });
      return r;
    });
    return reply.status(201).header("Cache-Control", "no-store").send({ id: row.id, code, expiresAt, scopes: row.scopes });
  });

  app.get("/link-codes", { preHandler: manage }, async (req) => ({
    items: await prisma.integrationLinkCode.findMany({
      where: { organizationId: req.auth.organizationId }, orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, scopes: true, createdAt: true, expiresAt: true, usedAt: true, usedLabel: true, revokedAt: true },
    }),
  }));

  /*
   * Revocar NO pide la contraseña: solo quita acceso (no puede conceder nada) y en un incidente tiene que poder hacerse
   * en el acto. Sigue exigiendo parish:profile, el segundo factor reciente si la cuenta lo tiene, y queda auditado.
   */
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
   * lo volverá a tomar en su próxima publicación (revoca la credencial para impedirlo). Pide la contraseña (D1).
   */
  app.post("/release-profile", { preHandler: [manage, app.requireRecentMfa], config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req) => {
    const { password } = sigypReauthSchema.parse(req.body ?? {});
    await assertPasswordReauth(req, password, "sigyp:profile:release");
    const r = await prisma.organization.updateMany({ where: { id: req.auth.organizationId, profileSource: "SIGYP" }, data: { profileSource: null } });
    if (r.count !== 1) throw new AppError(409, "NOT_MANAGED", "El perfil no está administrado por SIGyP.");
    await audit(req, { action: "SIGYP_PROFILE_RELEASED", entityType: "Organization", entityId: req.auth.organizationId });
    return { ok: true };
  });
}
