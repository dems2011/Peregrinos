-- A3 (2/2): ciclo de vida de organizaciones, solicitudes de parroquia y auditoría de transiciones.
-- Segura para datos existentes: no borra filas; las organizaciones actuales quedan APPROVED.

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "platformGrant" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: las organizaciones existentes quedan APPROVED; las nuevas nacen DRAFT.
ALTER TABLE "Organization" ADD COLUMN     "status" "OrganizationStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "Organization" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "OrganizationRequest" (
    "id" TEXT NOT NULL,
    "parishName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "countryCode" TEXT NOT NULL,
    "locality" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "editTokenHash" TEXT NOT NULL,
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submissionCount" INTEGER NOT NULL DEFAULT 1,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationStatusChange" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "requestId" TEXT,
    "fromStatus" "OrganizationStatus",
    "toStatus" "OrganizationStatus" NOT NULL,
    "actorUserId" TEXT,
    "actorAccountType" "AccountType",
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationRequest_editTokenHash_key" ON "OrganizationRequest"("editTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationRequest_organizationId_key" ON "OrganizationRequest"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationRequest_status_createdAt_idx" ON "OrganizationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationRequest_contactEmail_idx" ON "OrganizationRequest"("contactEmail");

-- CreateIndex
CREATE INDEX "OrganizationStatusChange_organizationId_createdAt_idx" ON "OrganizationStatusChange"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationStatusChange_requestId_createdAt_idx" ON "OrganizationStatusChange"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationStatusChange" ADD CONSTRAINT "OrganizationStatusChange_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationStatusChange" ADD CONSTRAINT "OrganizationStatusChange_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OrganizationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationStatusChange" ADD CONSTRAINT "OrganizationStatusChange_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas impuestas por la BD (deny-by-default).
-- Operador de plataforma: sin organización, sin rol y sin permisos extra.
ALTER TABLE "User" ADD CONSTRAINT "User_platform_without_org_authz"
  CHECK ("accountType" <> 'PLATFORM' OR ("organizationId" IS NULL AND "role" IS NULL AND COALESCE(cardinality("extraPermissions"), 0) = 0));
-- Solo una invitación de fundador emitida por PLATFORM puede otorgar SUPERADMIN.
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_platform_grant_is_superadmin"
  CHECK (NOT "platformGrant" OR "role" = 'SUPERADMIN');
-- Una solicitud solo puede estar pendiente, aprobada (con su organización) o rechazada (con motivo).
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_status_valid"
  CHECK ("status" IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED'));
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_approved_has_org"
  CHECK ("status" <> 'APPROVED' OR "organizationId" IS NOT NULL);
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_rejected_has_reason"
  CHECK ("status" <> 'REJECTED' OR length(btrim(coalesce("rejectionReason", ''))) > 0);
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_country_iso2"
  CHECK ("countryCode" ~ '^[A-Z]{2}$');
-- Cada transición registrada pertenece a una organización o a una solicitud.
ALTER TABLE "OrganizationStatusChange" ADD CONSTRAINT "OrganizationStatusChange_has_subject"
  CHECK ("organizationId" IS NOT NULL OR "requestId" IS NOT NULL);

-- Como máximo una solicitud pendiente por parroquia y correo de contacto (atómico frente a envíos simultáneos).
-- Índice parcial: Prisma no lo representa en el schema; se crea solo aquí.
CREATE UNIQUE INDEX "OrganizationRequest_pending_unique"
  ON "OrganizationRequest"(lower("contactEmail"), lower("parishName"))
  WHERE "status" = 'PENDING_REVIEW';
