-- SIGyP — integración entrante desde SIGyP (Gestión Parroquial): credenciales por organización y cartelera recibida.
-- Contrato v1: docs/INTEGRACION-SIGYP.md.
-- ADITIVA: solo crea dos tablas con sus índices y claves, y agrega a Organization columnas nulas o con valor por
-- defecto. No modifica ni borra datos existentes.
-- Rollback conceptual (antes de que existan datos nuevos): DROP de "ParishAnnouncement" e "IntegrationClient"; DROP
-- COLUMN de Organization.officeHours, profileSource, profileSyncedVersion y profileSyncedAt.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "officeHours" TEXT,
ADD COLUMN     "profileSource" TEXT,
ADD COLUMN     "profileSyncedAt" TIMESTAMP(3),
ADD COLUMN     "profileSyncedVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "IntegrationClient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SIGYP',
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "IntegrationClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParishAnnouncement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL DEFAULT 'SIGYP',
    "sourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParishAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationClient_tokenHash_key" ON "IntegrationClient"("tokenHash");

-- CreateIndex
CREATE INDEX "IntegrationClient_organizationId_revokedAt_idx" ON "IntegrationClient"("organizationId", "revokedAt");

-- CreateIndex
CREATE INDEX "ParishAnnouncement_organizationId_withdrawnAt_startsAt_idx" ON "ParishAnnouncement"("organizationId", "withdrawnAt", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParishAnnouncement_organizationId_sourceSystem_sourceId_key" ON "ParishAnnouncement"("organizationId", "sourceSystem", "sourceId");

-- AddForeignKey
ALTER TABLE "IntegrationClient" ADD CONSTRAINT "IntegrationClient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParishAnnouncement" ADD CONSTRAINT "ParishAnnouncement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Coherencia (la API valida lo mismo; la base lo garantiza).
ALTER TABLE "ParishAnnouncement" ADD CONSTRAINT "ParishAnnouncement_version_check" CHECK ("version" >= 1);
ALTER TABLE "ParishAnnouncement" ADD CONSTRAINT "ParishAnnouncement_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_profileSource_check" CHECK ("profileSource" IS NULL OR "profileSource" = 'SIGYP');
