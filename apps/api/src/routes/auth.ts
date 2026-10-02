import type { FastifyInstance } from "fastify";
import { bootstrapSchema, loginSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, unauthorized } from "../lib/errors";
import { dummyHash, hashPassword, verifyPassword } from "../lib/password";
import { sha256 } from "../lib/tokens";
import { REFRESH_COOKIE } from "../plugins/auth";
import { buildMe, clearSession, issueSession } from "../lib/session";

export default async function authRoutes(app: FastifyInstance) {
  const strict = { rateLimit: { max: 10, timeWindow: "1 minute" } };

  /** Crea la organización y el primer SUPERADMIN. Solo funciona mientras no exista ningún usuario. */
  app.post("/bootstrap", { config: strict }, async (req, reply) => {
    const body = bootstrapSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) throw new AppError(409, "ALREADY_INITIALIZED", "El sistema ya fue inicializado.");
      const org = await tx.organization.create({ data: { name: body.organizationName } });
      return tx.user.create({
        data: { organizationId: org.id, name: body.name, email: body.email, passwordHash, role: "SUPERADMIN" },
      });
    });
    await audit(req, { action: "SYSTEM_BOOTSTRAP", entityType: "User", entityId: user.id, userId: user.id, organizationId: user.organizationId });
    await issueSession(app, req, reply, user);
    return reply.status(201).send(await buildMe(user.id));
  });

  app.post("/login", { config: strict }, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(await dummyHash(), password), false);
    if (!user || !ok || !user.isActive) {
      await audit(req, { action: "LOGIN_FAILED", entityType: "User", entityId: user?.id, userId: user?.id, organizationId: user?.organizationId, metadata: { email } });
      throw unauthorized("Correo o contraseña incorrectos.");
    }
    await issueSession(app, req, reply, user);
    await audit(req, { action: "LOGIN", entityType: "User", entityId: user.id, userId: user.id, organizationId: user.organizationId });
    return buildMe(user.id);
  });

  /** Rota el refresh token. Si se reutiliza uno ya revocado, se cierran todas las sesiones del usuario. */
  app.post("/refresh", { config: strict }, async (req, reply) => {
    const raw = req.cookies[REFRESH_COOKIE];
    if (!raw) throw unauthorized();
    const token = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
    if (!token) { clearSession(reply); throw unauthorized(); }
    if (token.revokedAt) {
      await prisma.refreshToken.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(req, { action: "REFRESH_REUSE_DETECTED", entityType: "User", entityId: token.userId, userId: token.userId, organizationId: token.user.organizationId });
      clearSession(reply);
      throw unauthorized();
    }
    if (token.expiresAt < new Date() || !token.user.isActive) { clearSession(reply); throw unauthorized(); }
    await prisma.refreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } });
    await issueSession(app, req, reply, token.user);
    return buildMe(token.userId);
  });

  app.post("/logout", async (req, reply) => {
    const raw = req.cookies[REFRESH_COOKIE];
    if (raw) await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
    clearSession(reply);
    return reply.status(204).send();
  });

  app.get("/me", { preHandler: app.authenticate }, async (req) => buildMe(req.auth.id));
}
