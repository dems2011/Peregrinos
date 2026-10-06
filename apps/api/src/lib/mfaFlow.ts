import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { AppError } from "./errors";
import {
  MFA_LOCK_MINUTES,
  MFA_MAX_FAILURES,
  decryptSecret,
  recoveryCodeHash,
  verifyTotp,
} from "./mfa";

/**
 * A6 — Verificación del segundo factor (login en dos pasos y step-up). Todo cambio de estado es condicional en la BD:
 *  - TOTP: el paso aceptado se guarda con `mfaLastStep < paso` → dos peticiones simultáneas con el mismo código: una gana.
 *  - Recuperación: `usedAt IS NULL` → un código sirve una sola vez.
 *  - Fallos: contador por cuenta; al llegar a MFA_MAX_FAILURES se bloquea MFA_LOCK_MINUTES (además del límite por IP).
 */
export type SecondFactorInput = { code?: string; recoveryCode?: string };
export type SecondFactorMethod = "TOTP" | "RECOVERY_CODE";

export const mfaLocked = () =>
  new AppError(429, "MFA_LOCKED", `Demasiados intentos. Espera ${MFA_LOCK_MINUTES} minutos y vuelve a intentar.`);
// 400 (no 401): un código incorrecto no es una sesión vencida; los clientes no deben refrescar ni cerrar sesión.
const invalidCode = () => new AppError(400, "MFA_INVALID", "El código no es válido.");

export async function verifySecondFactor(
  req: FastifyRequest,
  userId: string,
  input: SecondFactorInput,
  context: "LOGIN" | "STEP_UP"
): Promise<SecondFactorMethod> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, organizationId: true, mfaTotpSecret: true, mfaEnabledAt: true, mfaLastStep: true, mfaLockedUntil: true },
  });
  if (!user?.mfaEnabledAt || !user.mfaTotpSecret) throw invalidCode();

  const now = new Date();
  if (user.mfaLockedUntil && user.mfaLockedUntil > now) {
    await audit(req, { action: "MFA_LOCKED_ATTEMPT", entityType: "User", entityId: user.id, userId: user.id, organizationId: user.organizationId, metadata: { context } });
    throw mfaLocked();
  }

  let method: SecondFactorMethod | null = null;
  if (input.code) {
    const step = verifyTotp(decryptSecret(user.mfaTotpSecret, user.id), input.code, { lastStep: user.mfaLastStep });
    if (step !== null) {
      const r = await prisma.user.updateMany({
        where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
        data: { mfaLastStep: step, mfaFailedCount: 0, mfaLockedUntil: null },
      });
      if (r.count === 1) method = "TOTP";
    }
  } else if (input.recoveryCode) {
    const r = await prisma.mfaRecoveryCode.updateMany({
      where: { userId: user.id, codeHash: recoveryCodeHash(user.id, input.recoveryCode), usedAt: null },
      data: { usedAt: now },
    });
    if (r.count === 1) {
      method = "RECOVERY_CODE";
      await prisma.user.update({ where: { id: user.id }, data: { mfaFailedCount: 0, mfaLockedUntil: null } });
    }
  }

  if (!method) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { mfaFailedCount: { increment: 1 } },
      select: { mfaFailedCount: true },
    });
    const lock = updated.mfaFailedCount >= MFA_MAX_FAILURES;
    if (lock) {
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaFailedCount: 0, mfaLockedUntil: new Date(now.getTime() + MFA_LOCK_MINUTES * 60_000) },
      });
    }
    await audit(req, {
      action: context === "LOGIN" ? "MFA_LOGIN_FAILED" : "MFA_STEP_UP_FAILED",
      entityType: "User", entityId: user.id, userId: user.id, organizationId: user.organizationId,
      metadata: { kind: input.code ? "TOTP" : "RECOVERY_CODE", locked: lock },
    });
    throw lock ? mfaLocked() : invalidCode();
  }

  if (method === "RECOVERY_CODE") {
    const remaining = await prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } });
    await audit(req, { action: "MFA_RECOVERY_CODE_USED", entityType: "User", entityId: user.id, userId: user.id, organizationId: user.organizationId, metadata: { context, remaining } });
  }
  return method;
}
