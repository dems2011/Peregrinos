-- B1: perfil público de la parroquia (imágenes), seguidores, avisos, chat por evento, formulario de inscripción por
-- evento y diseño de credencial. Aditiva: crea tablas y columnas con valores por defecto; no borra ni transforma datos.
-- Único dato que se completa: publishedNotifiedAt de los eventos ya publicados (para no avisar retroactivamente).
-- Rollback conceptual: quitar las tablas nuevas, sus enums y las columnas Event.registrationFields/credentialMode/
-- publishedNotifiedAt y Registration.formAnswers.

-- CreateEnum
CREATE TYPE "CredentialMode" AS ENUM ('STANDARD', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PARISH_LOGO', 'PARISH_COVER', 'CREDENTIAL_BACKGROUND');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('MANUAL', 'EVENT_PUBLISHED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "credentialMode" "CredentialMode" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "publishedNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "registrationFields" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "formAnswers" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT,
    "kind" "MediaKind" NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParishFollower" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParishFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("notificationId","userId")
);

-- CreateTable
CREATE TABLE "EventChatMessage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorPersonId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "EventChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_kind_idx" ON "MediaAsset"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "MediaAsset_eventId_idx" ON "MediaAsset"("eventId");

-- CreateIndex
CREATE INDEX "ParishFollower_userId_idx" ON "ParishFollower"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ParishFollower_organizationId_userId_key" ON "ParishFollower"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_createdAt_idx" ON "NotificationRecipient"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EventChatMessage_eventId_createdAt_idx" ON "EventChatMessage"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParishFollower" ADD CONSTRAINT "ParishFollower_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParishFollower" ADD CONSTRAINT "ParishFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_authorPersonId_fkey" FOREIGN KEY ("authorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Eventos ya publicados antes de B1: se consideran avisados (los seguidores solo reciben publicaciones nuevas).
UPDATE "Event" SET "publishedNotifiedAt" = "updatedAt" WHERE "status" <> 'DRAFT' AND "publishedNotifiedAt" IS NULL;

-- Deny-by-default (Prisma no representa CHECK ni índices parciales).
ALTER TABLE "Event" ADD CONSTRAINT "Event_registration_fields_array" CHECK (jsonb_typeof("registrationFields") = 'array');
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_form_answers_object" CHECK (jsonb_typeof("formAnswers") = 'object');

-- Imágenes: tipo y peso reales (la API valida además dimensiones y proporción); fondo de credencial ⇔ evento.
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_mime_allowed" CHECK ("mime" IN ('image/png', 'image/jpeg', 'image/webp'));
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_size_matches" CHECK ("sizeBytes" = octet_length("data") AND "sizeBytes" BETWEEN 1 AND 3145728);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_dimensions_positive" CHECK ("width" BETWEEN 1 AND 8000 AND "height" BETWEEN 1 AND 8000);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_event_only_for_credential" CHECK (("kind" = 'CREDENTIAL_BACKGROUND') = ("eventId" IS NOT NULL));
-- Una vigente por destino: logo e imagen por parroquia, fondo de credencial por evento.
CREATE UNIQUE INDEX "MediaAsset_parish_kind_unique" ON "MediaAsset"("organizationId", "kind") WHERE "eventId" IS NULL;
CREATE UNIQUE INDEX "MediaAsset_event_credential_unique" ON "MediaAsset"("eventId") WHERE "kind" = 'CREDENTIAL_BACKGROUND';

-- Avisos y chat: textos no vacíos y acotados.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_title_len" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_body_len" CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipients_non_negative" CHECK ("recipientCount" >= 0);
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_single_author" CHECK (num_nonnulls("authorUserId", "authorPersonId") = 1);
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_body_len" CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000);
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_moderation_consistent" CHECK ("deletedById" IS NULL OR "deletedAt" IS NOT NULL);