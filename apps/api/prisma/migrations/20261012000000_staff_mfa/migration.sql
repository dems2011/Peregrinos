-- A6: MFA del personal (TOTP + códigos de recuperación + step-up). Aditiva: no borra ni modifica datos existentes.
--   · User.mfa*: secreto TOTP cifrado (AES-256-GCM), enrolamiento pendiente, anti-replay y bloqueo por intentos.
--   · RefreshToken.mfaAt: último segundo factor de la sesión (step-up de 10 minutos tras refrescar).
--   · MfaRecoveryCode: códigos de un solo uso; solo su HMAC.
-- Ninguna cuenta queda con MFA activo: los SUPERADMIN existentes deberán enrolarse al ingresar (MFA_ENFORCE_SUPERADMIN).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaTotpSecret" TEXT,
ADD COLUMN     "mfaPendingSecret" TEXT,
ADD COLUMN     "mfaPendingAt" TIMESTAMP(3),
ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaLastStep" INTEGER,
ADD COLUMN     "mfaFailedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mfaLockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "mfaAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryCode_codeHash_key" ON "MfaRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "MfaRecoveryCode_userId_idx" ON "MfaRecoveryCode"("userId");

-- AddForeignKey
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-by-default (Prisma no representa CHECK).
-- MFA activo ⇔ hay secreto confirmado.
ALTER TABLE "User" ADD CONSTRAINT "User_mfa_enabled_has_secret"
  CHECK (("mfaEnabledAt" IS NULL) = ("mfaTotpSecret" IS NULL));
-- El enrolamiento pendiente siempre tiene fecha (vence a los 15 minutos, lo valida la API).
ALTER TABLE "User" ADD CONSTRAINT "User_mfa_pending_consistent"
  CHECK (("mfaPendingSecret" IS NULL) = ("mfaPendingAt" IS NULL));
-- Solo el personal tiene MFA en A6 (PILGRIM y PLATFORM no lo usan todavía).
ALTER TABLE "User" ADD CONSTRAINT "User_mfa_staff_only"
  CHECK ("accountType" = 'STAFF' OR ("mfaTotpSecret" IS NULL AND "mfaPendingSecret" IS NULL));
ALTER TABLE "User" ADD CONSTRAINT "User_mfa_failed_non_negative" CHECK ("mfaFailedCount" >= 0);
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_used_after_created"
  CHECK ("usedAt" IS NULL OR "usedAt" >= "createdAt");
