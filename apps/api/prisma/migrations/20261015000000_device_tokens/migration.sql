-- Push: tokens FCM de los dispositivos de cada cuenta. Aditiva: crea un enum y una tabla; no toca datos existentes.
-- Rollback conceptual: DROP TABLE "DeviceToken"; DROP TYPE "DevicePlatform".

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID');

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL DEFAULT 'ANDROID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- Índice parcial (no modelado en Prisma): tokens activos de una cuenta, la consulta del envío de push.
CREATE INDEX "DeviceToken_active_userId_idx" ON "DeviceToken"("userId") WHERE "revokedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
