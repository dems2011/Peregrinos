import type { FastifyInstance, FastifyRequest } from "fastify";
import QRCode from "qrcode";
import { mfaConfirmSchema, mfaPasswordSchema, mfaVerifySchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { AppError, unauthorized } from "../lib/errors";
import { verifyPassword } from "../lib/password";
import { sha256 } from "../lib/tokens";
import { REFRESH_COOKIE } from "../plugins/auth";
import {
  MFA_PENDING_MINUTES,
  decryptSecret,
  encryptSecret,
  mfaEnrollmentRequired,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUrl,
  verifyTotp,
} from "../lib/mfa";
import { verifySecondFactor } from "../lib/mfaFlow";
import {
  buildMe,
  clearMfaChallenge,
  issueSession,
  readMfaChallenge,
  setStaffAccessToken,
} from "../lib/session";

/**
 * A6 — MFA del personal (prefijo /api/auth/mfa). Login en dos pasos, enrolamiento TOTP, códigos de recuperación,
 * step-up de STEP_UP_MINUTES y baja. Las rutas con `mfaEnrollment` quedan disponibles para un SUPERADMIN sin MFA.
 */
export default async function mfaRoutes(app: FastifyInstance) {
  const limit = (max: number, timeWindow: string) => ({ rateLimit: { max, timeWindow } });

  /** Contraseña de la cuenta autenticada (enrolar, regenerar códigos o desactivar: protege ante una sesión robada). */
  async function assertPassword(req: FastifyRequest, password: string, action: string) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(u.passwordHash, password))) {
      await audit(req, { action: "MFA_PASSWORD_FAILED", entityType: "User", entityId: req.auth.id, metadata: { action } });
      throw new AppError(400, "INVALID_PASSWORD", "La contraseña no es correcta.");
    }
  }

  /** Cierra todas las sesiones de la cuenta (versión + refresh tokens) y abre una nueva para esta petición. */
  async function rotateSessions(req: FastifyRequest, reply: Parameters<typeof issueSession>[2], mfaAt: Date | null) {
    const user = await prisma.user.update({
      where: { id: req.auth.id },
      data: { sessionVersion: { increment: 1 } },
      select: { id: true, role: true, accountType: true, sessionVersion: true },
    });
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await issueSession(app, req, reply, user, { mfaAt });
  }

  /* ---------- Segundo paso del login ---------- */
  app.post("/verify", { config: limit(10, "1 minute") }, async (req, reply) => {
    const body = mfaVerifySchema.parse(req.body);
    const challenge = readMfaChallenge(app, req);
    if (!challenge) throw unauthorized("La verificación venció. Ingresa de nuevo con tu contraseña.");

    const user = await prisma.user.findUnique({
      where: { id: challenge.sub },
      select: { id: true, role: true, accountType: true, isActive: true, organizationId: true, sessionVersion: true, mfaEnabledAt: true },
    });
    // El desafío deja de valer si la cuenta cambió (sv) o ya no es personal activo con MFA.
    if (!user || !user.isActive || user.accountType !== "STAFF" || !user.role || !user.mfaEnabledAt || user.sessionVersion !== challenge.sv) {
      clearMfaChallenge(reply);
      throw unauthorized("La verificación venció. Ingresa de nuevo con tu contraseña.");
    }

    const method = await verifySecondFactor(req, user.id, body, "LOGIN");
    const now = new Date();
    clearMfaChallenge(reply);
    await issueSession(app, req, reply, user, { mfaAt: now });
    await audit(req, { action: "LOGIN", entityType: "User", entityId: user.id, userId: user.id, organizationId: user.organizationId, metadata: { accountType: "STAFF", mfa: method } });
    return buildMe(user.id, now);
  });

  /* ---------- Enrolamiento ---------- */
  app.post(
    "/enroll/start",
    { preHandler: app.authenticate, config: { ...limit(10, "15 minutes"), mfaEnrollment: true } },
    async (req) => {
      const { password } = mfaPasswordSchema.parse(req.body);
      if (req.auth.mfaEnabled) throw new AppError(409, "MFA_ALREADY_ENABLED", "La verificación en dos pasos ya está activa.");
      await assertPassword(req, password, "ENROLL_START");

      const secret = newTotpSecret();
      await prisma.user.update({
        where: { id: req.auth.id },
        data: { mfaPendingSecret: encryptSecret(secret, req.auth.id), mfaPendingAt: new Date() },
      });
      await audit(req, { action: "MFA_ENROLL_STARTED", entityType: "User", entityId: req.auth.id });
      // El secreto se muestra una sola vez (QR + texto); en la BD queda cifrado. El QR se genera en el servidor para
      // que el secreto no pase por servicios externos.
      const url = otpauthUrl(secret, req.auth.email);
      const qrSvg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
      return { secret, otpauthUrl: url, qrSvg, expiresInMinutes: MFA_PENDING_MINUTES };
    }
  );

  app.post(
    "/enroll/confirm",
    { preHandler: app.authenticate, config: { ...limit(10, "15 minutes"), mfaEnrollment: true } },
    async (req, reply) => {
      const { code } = mfaConfirmSchema.parse(req.body);
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: req.auth.id },
        select: { mfaEnabledAt: true, mfaPendingSecret: true, mfaPendingAt: true },
      });
      if (u.mfaEnabledAt) throw new AppError(409, "MFA_ALREADY_ENABLED", "La verificación en dos pasos ya está activa.");
      if (!u.mfaPendingSecret || !u.mfaPendingAt || Date.now() - u.mfaPendingAt.getTime() > MFA_PENDING_MINUTES * 60_000) {
        throw new AppError(400, "MFA_ENROLL_EXPIRED", "El enrolamiento venció. Empieza de nuevo.");
      }
      const step = verifyTotp(decryptSecret(u.mfaPendingSecret, req.auth.id), code);
      if (step === null) {
        await audit(req, { action: "MFA_ENROLL_FAILED", entityType: "User", entityId: req.auth.id });
        throw new AppError(400, "MFA_INVALID", "El código no es válido. Revisa la hora del teléfono y vuelve a intentar.");
      }

      const codes = newRecoveryCodes(req.auth.id);
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        // Condicional: dos confirmaciones simultáneas no pueden activar dos veces ni con otro secreto.
        const r = await tx.user.updateMany({
          where: { id: req.auth.id, mfaEnabledAt: null, mfaPendingSecret: u.mfaPendingSecret },
          data: {
            mfaTotpSecret: u.mfaPendingSecret, mfaEnabledAt: now, mfaLastStep: step,
            mfaPendingSecret: null, mfaPendingAt: null, mfaFailedCount: 0, mfaLockedUntil: null,
          },
        });
        if (r.count !== 1) throw new AppError(409, "MFA_ALREADY_ENABLED", "La verificación en dos pasos ya está activa.");
        await tx.mfaRecoveryCode.deleteMany({ where: { userId: req.auth.id } });
        await tx.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId: req.auth.id, codeHash: c.hash })) });
        await auditTx(tx, req, { action: "MFA_ENABLED", entityType: "User", entityId: req.auth.id, metadata: { method: "TOTP", role: req.auth.role } });
      });
      // §8.3: cambiar el MFA revoca las demás sesiones; esta continúa con el factor recién verificado.
      await rotateSessions(req, reply, now);
      return { recoveryCodes: codes.map((c) => c.display), me: await buildMe(req.auth.id, now) };
    }
  );

  /* ---------- Step-up ---------- */
  app.post("/step-up", { preHandler: app.authenticate, config: limit(10, "1 minute") }, async (req, reply) => {
    const body = mfaVerifySchema.parse(req.body);
    if (!req.auth.mfaEnabled) throw new AppError(409, "MFA_NOT_ENABLED", "La verificación en dos pasos no está activa.");
    await verifySecondFactor(req, req.auth.id, body, "STEP_UP");

    const now = new Date();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.id }, select: { sessionVersion: true } });
    // El refresh token de esta sesión guarda el momento del factor: refrescar no pierde el step-up.
    const raw = req.cookies[REFRESH_COOKIE];
    if (raw) {
      await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), userId: req.auth.id, revokedAt: null }, data: { mfaAt: now } });
    }
    setStaffAccessToken(app, reply, { id: req.auth.id, role: req.auth.role, sessionVersion: user.sessionVersion }, now);
    await audit(req, { action: "MFA_STEP_UP", entityType: "User", entityId: req.auth.id });
    return buildMe(req.auth.id, now);
  });

  /* ---------- Códigos de recuperación ---------- */
  app.post(
    "/recovery-codes",
    { preHandler: [app.authenticate, app.requireRecentMfa], config: limit(5, "15 minutes") },
    async (req) => {
      const { password } = mfaPasswordSchema.parse(req.body);
      if (!req.auth.mfaEnabled) throw new AppError(409, "MFA_NOT_ENABLED", "La verificación en dos pasos no está activa.");
      await assertPassword(req, password, "RECOVERY_CODES");
      const codes = newRecoveryCodes(req.auth.id);
      await prisma.$transaction(async (tx) => {
        await tx.mfaRecoveryCode.deleteMany({ where: { userId: req.auth.id } });
        await tx.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId: req.auth.id, codeHash: c.hash })) });
        await auditTx(tx, req, { action: "MFA_RECOVERY_CODES_REGENERATED", entityType: "User", entityId: req.auth.id });
      });
      return { recoveryCodes: codes.map((c) => c.display) };
    }
  );

  /* ---------- Baja ---------- */
  app.post(
    "/disable",
    { preHandler: [app.authenticate, app.requireRecentMfa], config: limit(5, "15 minutes") },
    async (req, reply) => {
      const { password } = mfaPasswordSchema.parse(req.body);
      if (!req.auth.mfaEnabled) throw new AppError(409, "MFA_NOT_ENABLED", "La verificación en dos pasos no está activa.");
      // §8.1: un SUPERADMIN no puede quedar sin MFA (para cambiar de teléfono: otro SUPERADMIN lo restablece).
      if (mfaEnrollmentRequired({ role: req.auth.role, mfaEnabledAt: null })) {
        throw new AppError(409, "MFA_REQUIRED_FOR_ROLE", "La verificación en dos pasos es obligatoria para tu rol.");
      }
      await assertPassword(req, password, "DISABLE");
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: req.auth.id },
          data: { mfaTotpSecret: null, mfaEnabledAt: null, mfaLastStep: null, mfaPendingSecret: null, mfaPendingAt: null, mfaFailedCount: 0, mfaLockedUntil: null },
        });
        await tx.mfaRecoveryCode.deleteMany({ where: { userId: req.auth.id } });
        await auditTx(tx, req, { action: "MFA_DISABLED", entityType: "User", entityId: req.auth.id, metadata: { role: req.auth.role } });
      });
      await rotateSessions(req, reply, null);
      return buildMe(req.auth.id, null);
    }
  );

  /** Abandonar el desafío del login (volver a la pantalla de contraseña). */
  app.post("/cancel", async (_req, reply) => {
    clearMfaChallenge(reply);
    return reply.status(204).send();
  });
}
