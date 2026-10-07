-- B2: datos de perfil público en la solicitud de parroquia (sitio web, redes, foto principal) y estructura preparada
-- para suscripciones (Google Play u otorgadas por la plataforma). Aditiva: solo crea enums, tablas, columnas opcionales,
-- índices y restricciones. No borra, renombra ni transforma datos; no completa filas existentes.
-- Rollback conceptual: quitar OrganizationSubscription, OrganizationRequestPhoto, los enums SubscriptionStatus y
-- SubscriptionProvider, y las columnas website/instagram/facebook/youtube de OrganizationRequest.
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'ON_HOLD', 'PAUSED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionProvider" AS ENUM ('NONE', 'GOOGLE_PLAY', 'MANUAL');

-- AlterTable
ALTER TABLE "OrganizationRequest" ADD COLUMN     "facebook" TEXT,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "youtube" TEXT;

-- CreateTable
CREATE TABLE "OrganizationRequestPhoto" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationRequestPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "provider" "SubscriptionProvider" NOT NULL DEFAULT 'NONE',
    "productId" TEXT,
    "basePlanId" TEXT,
    "currentPeriodEndsAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationRequestPhoto_requestId_key" ON "OrganizationRequestPhoto"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSubscription_organizationId_key" ON "OrganizationSubscription"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationSubscription_status_idx" ON "OrganizationSubscription"("status");

-- AddForeignKey
ALTER TABLE "OrganizationRequestPhoto" ADD CONSTRAINT "OrganizationRequestPhoto_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OrganizationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deny-by-default (Prisma no representa CHECK). Límites alineados con los de Organization y PARISH_IMAGE_SPEC.cover.
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_website_len" CHECK ("website" IS NULL OR char_length("website") BETWEEN 1 AND 300);
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_social_len" CHECK (
  ("instagram" IS NULL OR char_length("instagram") BETWEEN 1 AND 200) AND
  ("facebook" IS NULL OR char_length("facebook") BETWEEN 1 AND 200) AND
  ("youtube" IS NULL OR char_length("youtube") BETWEEN 1 AND 200));

-- Foto: tipo y peso reales (máx. 2 MB), dimensiones positivas y hash SHA-256 en hexadecimal.
ALTER TABLE "OrganizationRequestPhoto" ADD CONSTRAINT "OrganizationRequestPhoto_mime_allowed" CHECK ("mime" IN ('image/png', 'image/jpeg', 'image/webp'));
ALTER TABLE "OrganizationRequestPhoto" ADD CONSTRAINT "OrganizationRequestPhoto_size_matches" CHECK ("sizeBytes" = octet_length("data") AND "sizeBytes" BETWEEN 1 AND 2097152);
ALTER TABLE "OrganizationRequestPhoto" ADD CONSTRAINT "OrganizationRequestPhoto_dimensions_positive" CHECK ("width" BETWEEN 1 AND 8000 AND "height" BETWEEN 1 AND 8000);
ALTER TABLE "OrganizationRequestPhoto" ADD CONSTRAINT "OrganizationRequestPhoto_sha256_hex" CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- Suscripción: un estado distinto de NONE exige un origen; Google Play exige el producto; externalRef es un hash
-- (nunca el token de compra en claro); identificadores de producto acotados.
ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_status_needs_provider" CHECK ("status" = 'NONE' OR "provider" <> 'NONE');
ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_google_play_product" CHECK ("provider" <> 'GOOGLE_PLAY' OR "productId" IS NOT NULL);
ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_external_ref_hash" CHECK ("externalRef" IS NULL OR "externalRef" ~ '^[0-9a-f]{64}$');
ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_ids_len" CHECK (
  ("productId" IS NULL OR char_length("productId") BETWEEN 1 AND 150) AND
  ("basePlanId" IS NULL OR char_length("basePlanId") BETWEEN 1 AND 150));
