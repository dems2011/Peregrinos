-- SIGyP — vinculación con código de un solo uso, eventos publicados desde SIGyP y avisos multigrupo.
-- Contrato v1 (ampliación compatible): docs/INTEGRACION-SIGYP.md.
-- ADITIVA: crea "IntegrationLinkCode"; agrega a "Event" y "Notification" columnas nulas o con valor por defecto y un
-- índice único parcial por origen (NULL no colisiona: los eventos y avisos existentes no se ven afectados). No modifica
-- ni borra datos. Los avisos existentes quedan con delivery = 'PUSH' (lo que ya hacían: bandeja + push).
-- Rollback conceptual (antes de que existan datos nuevos): DROP de "IntegrationLinkCode" y de las columnas
-- Event.sourceSystem/sourceId/sourceVersion/attendanceMode/onlineUrl y Notification.delivery/urgent/audience/
-- sourceSystem/sourceId con sus índices.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "attendanceMode" TEXT,
ADD COLUMN     "onlineUrl" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceSystem" TEXT,
ADD COLUMN     "sourceVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "audience" JSONB,
ADD COLUMN     "delivery" TEXT NOT NULL DEFAULT 'PUSH',
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceSystem" TEXT,
ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "IntegrationLinkCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedClientId" TEXT,
    "usedLabel" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationLinkCode_codeHash_key" ON "IntegrationLinkCode"("codeHash");

-- CreateIndex
CREATE INDEX "IntegrationLinkCode_organizationId_usedAt_revokedAt_idx" ON "IntegrationLinkCode"("organizationId", "usedAt", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_organizationId_sourceSystem_sourceId_key" ON "Event"("organizationId", "sourceSystem", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_organizationId_sourceSystem_sourceId_key" ON "Notification"("organizationId", "sourceSystem", "sourceId");

-- AddForeignKey
ALTER TABLE "IntegrationLinkCode" ADD CONSTRAINT "IntegrationLinkCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Coherencia (la API valida lo mismo; la base lo garantiza).
ALTER TABLE "Event" ADD CONSTRAINT "Event_source_check" CHECK (("sourceSystem" IS NULL) = ("sourceId" IS NULL) AND ("sourceSystem" IS NULL OR "sourceSystem" = 'SIGYP'));
ALTER TABLE "Event" ADD CONSTRAINT "Event_attendanceMode_check" CHECK ("attendanceMode" IS NULL OR "attendanceMode" IN ('IN_PERSON', 'ONLINE', 'HYBRID'));
ALTER TABLE "Event" ADD CONSTRAINT "Event_onlineUrl_check" CHECK ("onlineUrl" IS NULL OR "onlineUrl" LIKE 'https://%');
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_delivery_check" CHECK ("delivery" IN ('PUSH', 'INBOX'));
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_source_check" CHECK (("sourceSystem" IS NULL) = ("sourceId" IS NULL));
ALTER TABLE "IntegrationLinkCode" ADD CONSTRAINT "IntegrationLinkCode_expiry_check" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '1 hour');
