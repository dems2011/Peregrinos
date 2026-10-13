-- B5: herramientas parroquiales — permisos de colaboradores (rechazo de invitaciones), transmisiones de YouTube,
-- seguimiento GPS opt-in, portadas de eventos, agenda pastoral, donaciones con enlace externo, boletín, solicitudes de
-- certificados, inventario y grupos pastorales.
-- ADITIVA: solo crea tipos, tablas e índices y agrega columnas con valor por defecto (o nulas). No modifica ni borra
-- datos existentes. Las tablas nuevas empiezan vacías.
-- Rollback conceptual (antes de que existan datos nuevos): DROP de las 14 tablas nuevas y sus tipos; DROP COLUMN de
-- Event.trackingEnabled, Invitation.declinedAt, Organization.timezone y ParishFollower.bulletinEmail. Los valores
-- LIVESTREAM y BULLETIN de NotificationKind no se pueden quitar de un enum (son inofensivos si no se usan).

-- CreateEnum
CREATE TYPE "LivestreamStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "LivestreamSource" AS ENUM ('MANUAL', 'YOUTUBE_API');

-- CreateEnum
CREATE TYPE "ContentImageOwner" AS ENUM ('EVENT_COVER', 'DONATION_CAMPAIGN');

-- CreateEnum
CREATE TYPE "ContentImageVariant" AS ENUM ('ORIGINAL', 'LARGE', 'MEDIUM', 'SMALL');

-- CreateEnum
CREATE TYPE "ScheduleKind" AS ENUM ('MASS', 'CONFESSION', 'ADORATION', 'CATECHESIS', 'MEETING', 'PATRONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DonationPurpose" AS ENUM ('MAINTENANCE', 'WORKS', 'CHARITY', 'SPECIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "BulletinStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('BAPTISM', 'CONFIRMATION', 'MARRIAGE');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'NEEDS_INFO', 'READY', 'DELIVERED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InventoryCategory" AS ENUM ('FURNITURE', 'IT', 'SOUND', 'INSTRUMENT', 'CATECHESIS', 'LITURGICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR', 'BROKEN');

-- CreateEnum
CREATE TYPE "PastoralGroupKind" AS ENUM ('CATECHESIS', 'READERS', 'MINISTERS', 'VOLUNTEERS', 'YOUTH', 'LITURGY', 'CHOIR', 'OTHER');

-- AlterEnum
-- PostgreSQL 12+ (Neon 18): ADD VALUE dentro de la transacción es válido; los valores nuevos no se usan aquí.
ALTER TYPE "NotificationKind" ADD VALUE 'LIVESTREAM';
ALTER TYPE "NotificationKind" ADD VALUE 'BULLETIN';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "trackingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "declinedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires';

-- AlterTable
ALTER TABLE "ParishFollower" ADD COLUMN     "bulletinEmail" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ParishLivestream" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT,
    "title" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "status" "LivestreamStatus" NOT NULL DEFAULT 'SCHEDULED',
    "statusSource" "LivestreamSource" NOT NULL DEFAULT 'MANUAL',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "announcedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParishLivestream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationShare" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentImage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerType" "ContentImageOwner" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "variant" "ContentImageVariant" NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "ScheduleKind" NOT NULL,
    "title" TEXT NOT NULL,
    "weekday" INTEGER,
    "date" DATE,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" "DonationPurpose" NOT NULL,
    "description" TEXT,
    "beneficiary" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bulletin" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "weekOf" DATE NOT NULL,
    "body" TEXT NOT NULL,
    "includeSchedule" BOOLEAN NOT NULL DEFAULT true,
    "includeEvents" BOOLEAN NOT NULL DEFAULT true,
    "includeCampaigns" BOOLEAN NOT NULL DEFAULT false,
    "status" "BulletinStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "emailCount" INTEGER NOT NULL DEFAULT 0,
    "notificationId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bulletin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "type" "CertificateType" NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'RECEIVED',
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "requesterDocument" TEXT,
    "subjectName" TEXT NOT NULL,
    "subjectBirthDate" DATE,
    "sacramentYear" INTEGER,
    "sacramentPlace" TEXT,
    "parentsNames" TEXT,
    "spouseName" TEXT,
    "purpose" TEXT,
    "details" TEXT,
    "publicMessage" TEXT,
    "accessTokenHash" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "CertificateStatus" NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "InventoryCategory" NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "condition" "InventoryCondition" NOT NULL DEFAULT 'GOOD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "acquiredAt" DATE,
    "responsible" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PastoralGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PastoralGroupKind" NOT NULL,
    "description" TEXT,
    "leaders" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PastoralGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PastoralGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "role" TEXT,
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PastoralGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PastoralGroupMeeting" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "topic" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PastoralGroupMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PastoralAttendance" (
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL,

    CONSTRAINT "PastoralAttendance_pkey" PRIMARY KEY ("meetingId","memberId")
);

-- CreateIndex
CREATE INDEX "ParishLivestream_organizationId_status_idx" ON "ParishLivestream"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LocationShare_participantId_key" ON "LocationShare"("participantId");

-- CreateIndex
CREATE INDEX "LocationShare_eventId_idx" ON "LocationShare"("eventId");

-- CreateIndex
CREATE INDEX "ContentImage_organizationId_idx" ON "ContentImage"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentImage_ownerType_ownerId_variant_key" ON "ContentImage"("ownerType", "ownerId", "variant");

-- CreateIndex
CREATE INDEX "ScheduleItem_organizationId_active_idx" ON "ScheduleItem"("organizationId", "active");

-- CreateIndex
CREATE INDEX "DonationCampaign_organizationId_active_idx" ON "DonationCampaign"("organizationId", "active");

-- CreateIndex
CREATE INDEX "Bulletin_organizationId_status_publishedAt_idx" ON "Bulletin"("organizationId", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateRequest_trackingCode_key" ON "CertificateRequest"("trackingCode");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateRequest_accessTokenHash_key" ON "CertificateRequest"("accessTokenHash");

-- CreateIndex
CREATE INDEX "CertificateRequest_organizationId_status_createdAt_idx" ON "CertificateRequest"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CertificateRequestEvent_requestId_createdAt_idx" ON "CertificateRequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryItem_organizationId_category_idx" ON "InventoryItem"("organizationId", "category");

-- CreateIndex
CREATE INDEX "PastoralGroup_organizationId_active_idx" ON "PastoralGroup"("organizationId", "active");

-- CreateIndex
CREATE INDEX "PastoralGroupMember_groupId_active_idx" ON "PastoralGroupMember"("groupId", "active");

-- CreateIndex
CREATE INDEX "PastoralGroupMeeting_groupId_date_idx" ON "PastoralGroupMeeting"("groupId", "date");

-- CreateIndex
CREATE INDEX "PastoralAttendance_memberId_idx" ON "PastoralAttendance"("memberId");

-- AddForeignKey
ALTER TABLE "ParishLivestream" ADD CONSTRAINT "ParishLivestream_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParishLivestream" ADD CONSTRAINT "ParishLivestream_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParishLivestream" ADD CONSTRAINT "ParishLivestream_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationShare" ADD CONSTRAINT "LocationShare_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationShare" ADD CONSTRAINT "LocationShare_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentImage" ADD CONSTRAINT "ContentImage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentImage" ADD CONSTRAINT "ContentImage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationCampaign" ADD CONSTRAINT "DonationCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationCampaign" ADD CONSTRAINT "DonationCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bulletin" ADD CONSTRAINT "Bulletin_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bulletin" ADD CONSTRAINT "Bulletin_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRequest" ADD CONSTRAINT "CertificateRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRequestEvent" ADD CONSTRAINT "CertificateRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CertificateRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRequestEvent" ADD CONSTRAINT "CertificateRequestEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastoralGroup" ADD CONSTRAINT "PastoralGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastoralGroupMember" ADD CONSTRAINT "PastoralGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PastoralGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastoralGroupMeeting" ADD CONSTRAINT "PastoralGroupMeeting_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PastoralGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastoralGroupMeeting" ADD CONSTRAINT "PastoralGroupMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastoralAttendance" ADD CONSTRAINT "PastoralAttendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PastoralGroupMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastoralAttendance" ADD CONSTRAINT "PastoralAttendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "PastoralGroupMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas de integridad que Prisma no modela (la base las exige aunque falle el código).
ALTER TABLE "ContentImage" ADD CONSTRAINT "ContentImage_mime_allowed" CHECK ("mime" IN ('image/png', 'image/jpeg', 'image/webp'));
ALTER TABLE "ContentImage" ADD CONSTRAINT "ContentImage_size_matches" CHECK ("sizeBytes" = octet_length("data") AND "sizeBytes" BETWEEN 1 AND 5242880);
ALTER TABLE "ContentImage" ADD CONSTRAINT "ContentImage_dimensions_positive" CHECK ("width" BETWEEN 1 AND 8000 AND "height" BETWEEN 1 AND 8000);

ALTER TABLE "LocationShare" ADD CONSTRAINT "LocationShare_coordinates_valid" CHECK (
  ("latitude" IS NULL) = ("longitude" IS NULL)
  AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
  AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
  AND ("accuracyM" IS NULL OR "accuracyM" >= 0)
);

-- Agenda: o cada semana (weekday) o un día puntual (date), nunca ambos ni ninguno; horas HH:MM.
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_when_valid" CHECK (
  ("weekday" IS NULL) <> ("date" IS NULL) AND ("weekday" IS NULL OR "weekday" BETWEEN 0 AND 6)
);
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_time_format" CHECK (
  "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ("endTime" IS NULL OR "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

-- Donaciones: solo enlaces https (el dominio permitido lo valida la API: lib/donations.ts).
ALTER TABLE "DonationCampaign" ADD CONSTRAINT "DonationCampaign_url_https" CHECK ("url" ~ '^https://');

ALTER TABLE "CertificateRequest" ADD CONSTRAINT "CertificateRequest_year_range" CHECK ("sacramentYear" IS NULL OR "sacramentYear" BETWEEN 1800 AND 2200);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_quantity_positive" CHECK ("quantity" >= 1);
