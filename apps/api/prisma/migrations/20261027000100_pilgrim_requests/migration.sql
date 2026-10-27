-- Solicitudes de los fieles a su parroquia, que SIGyP recoge y responde (2026-10-27). ADITIVA: un valor nuevo de
-- NotificationKind y dos tablas nuevas; no modifica ni borra datos existentes. Reversión probada:
-- prisma/rollback/20261027_pilgrim_requests_rollback.sql (se aborta si hay datos).
-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'REQUEST_STATUS';

-- CreateTable
CREATE TABLE "ParishRequestType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL DEFAULT 'SIGYP',
    "sourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParishRequestType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilgrimRequest" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "statusVersion" INTEGER NOT NULL DEFAULT 0,
    "number" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PilgrimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParishRequestType_organizationId_active_idx" ON "ParishRequestType"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ParishRequestType_organizationId_sourceSystem_sourceId_key" ON "ParishRequestType"("organizationId", "sourceSystem", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "PilgrimRequest_seq_key" ON "PilgrimRequest"("seq");

-- CreateIndex
CREATE INDEX "PilgrimRequest_organizationId_seq_idx" ON "PilgrimRequest"("organizationId", "seq");

-- CreateIndex
CREATE INDEX "PilgrimRequest_userId_createdAt_idx" ON "PilgrimRequest"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ParishRequestType" ADD CONSTRAINT "ParishRequestType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilgrimRequest" ADD CONSTRAINT "PilgrimRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilgrimRequest" ADD CONSTRAINT "PilgrimRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilgrimRequest" ADD CONSTRAINT "PilgrimRequest_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ParishRequestType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Coherencia (la API valida lo mismo; la base lo garantiza).
ALTER TABLE "ParishRequestType" ADD CONSTRAINT "ParishRequestType_source_check" CHECK ("sourceSystem" = 'SIGYP' AND "version" >= 1 AND length("name") BETWEEN 3 AND 120);
ALTER TABLE "PilgrimRequest" ADD CONSTRAINT "PilgrimRequest_status_check" CHECK ("status" IN ('SENT', 'RECEIVED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CLOSED', 'CANCELLED'));
-- Enviada ⇔ SIGyP todavía no publicó ningún estado.
ALTER TABLE "PilgrimRequest" ADD CONSTRAINT "PilgrimRequest_version_check" CHECK ("statusVersion" >= 0 AND (("status" = 'SENT') = ("statusVersion" = 0)));
ALTER TABLE "PilgrimRequest" ADD CONSTRAINT "PilgrimRequest_text_check" CHECK (length("description") BETWEEN 10 AND 2000 AND ("message" IS NULL OR length("message") <= 500));