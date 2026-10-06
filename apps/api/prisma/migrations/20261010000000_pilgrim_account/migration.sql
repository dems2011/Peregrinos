-- A5.0: área de cuenta del peregrino. Aditiva: no borra ni modifica datos existentes.
--   · User.sessionVersion: versión de las sesiones PILGRIM (va en el JWT). Cambiar o restablecer la contraseña la
--     incrementa e invalida las sesiones emitidas antes. Las cuentas existentes empiezan en 0 (sus sesiones siguen válidas).
--   · PasswordResetToken: recuperación de contraseña. Token aleatorio de un solo uso, con vencimiento; solo su hash.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-by-default (Prisma no representa CHECK).
ALTER TABLE "User" ADD CONSTRAINT "User_session_version_non_negative" CHECK ("sessionVersion" >= 0);
-- Un token usado nunca puede ser anterior a su creación (coherencia de auditoría).
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_used_after_created"
  CHECK ("usedAt" IS NULL OR "usedAt" >= "createdAt");
