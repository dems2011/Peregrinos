-- A5.1: voluntarios (primera versión). Aditiva: no borra ni modifica datos existentes.
-- La identidad sigue siendo Person: un voluntario es una VolunteerParticipation (Person + Event + estado), no un rol de
-- cuenta. Equipos, zonas, funciones y turnos son configurables por evento (nombres libres, sin enums). Las asignaciones
-- conectan quién, qué, dónde, cuándo y con quién, siempre dentro del mismo evento (FK compuestas).
-- Habilita la capacidad VOLUNTEERS (deja de estar reservada). Rollback conceptual: quitar las tablas nuevas, el enum,
-- la columna PersonClaim.movedVolunteerIds y restaurar el CHECK de reservadas con VOLUNTEERS.

-- CreateEnum
CREATE TYPE "VolunteerStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REVOKED', 'COMPLETED');

-- AlterTable
ALTER TABLE "PersonClaim" ADD COLUMN     "movedVolunteerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "VolunteerParticipation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "VolunteerStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "decisionReason" TEXT,
    "createdById" TEXT NOT NULL,
    "statusChangedById" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VolunteerParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyFunction" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DutyFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "zoneId" TEXT,
    "teamId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "teamId" TEXT,
    "zoneId" TEXT,
    "shiftId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,
    CONSTRAINT "VolunteerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolunteerParticipation_personId_idx" ON "VolunteerParticipation"("personId");

-- CreateIndex
CREATE INDEX "VolunteerParticipation_eventId_status_idx" ON "VolunteerParticipation"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerParticipation_eventId_personId_key" ON "VolunteerParticipation"("eventId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerParticipation_id_eventId_key" ON "VolunteerParticipation"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_eventId_name_key" ON "Team"("eventId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_id_eventId_key" ON "Team"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_eventId_name_key" ON "Zone"("eventId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_id_eventId_key" ON "Zone"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "DutyFunction_eventId_name_key" ON "DutyFunction"("eventId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DutyFunction_id_eventId_key" ON "DutyFunction"("id", "eventId");

-- CreateIndex
CREATE INDEX "Shift_eventId_startsAt_idx" ON "Shift"("eventId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_id_eventId_key" ON "Shift"("id", "eventId");

-- CreateIndex
CREATE INDEX "VolunteerAssignment_eventId_idx" ON "VolunteerAssignment"("eventId");

-- CreateIndex
CREATE INDEX "VolunteerAssignment_volunteerId_idx" ON "VolunteerAssignment"("volunteerId");

-- CreateIndex
CREATE INDEX "VolunteerAssignment_shiftId_idx" ON "VolunteerAssignment"("shiftId");

-- AddForeignKey
ALTER TABLE "VolunteerParticipation" ADD CONSTRAINT "VolunteerParticipation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerParticipation" ADD CONSTRAINT "VolunteerParticipation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyFunction" ADD CONSTRAINT "DutyFunction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_zoneId_eventId_fkey" FOREIGN KEY ("zoneId", "eventId") REFERENCES "Zone"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_teamId_eventId_fkey" FOREIGN KEY ("teamId", "eventId") REFERENCES "Team"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_volunteerId_eventId_fkey" FOREIGN KEY ("volunteerId", "eventId") REFERENCES "VolunteerParticipation"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_functionId_eventId_fkey" FOREIGN KEY ("functionId", "eventId") REFERENCES "DutyFunction"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_teamId_eventId_fkey" FOREIGN KEY ("teamId", "eventId") REFERENCES "Team"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_zoneId_eventId_fkey" FOREIGN KEY ("zoneId", "eventId") REFERENCES "Zone"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_shiftId_eventId_fkey" FOREIGN KEY ("shiftId", "eventId") REFERENCES "Shift"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deny-by-default (Prisma no representa CHECK ni índices parciales/de expresión).
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_ends_after_start" CHECK ("endsAt" > "startsAt");
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_revocation_complete"
  CHECK (("revokedAt" IS NULL AND "revokedById" IS NULL) OR ("revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL));
ALTER TABLE "VolunteerParticipation" ADD CONSTRAINT "VolunteerParticipation_reason_when_closed"
  CHECK ("status" NOT IN ('REJECTED', 'REVOKED') OR "decisionReason" IS NOT NULL);
-- Sin duplicados lógicos: la misma combinación voluntario + función + equipo + zona + turno solo una vez vigente.
CREATE UNIQUE INDEX "VolunteerAssignment_active_unique" ON "VolunteerAssignment"
  ("volunteerId", "functionId", COALESCE("teamId", ''), COALESCE("zoneId", ''), COALESCE("shiftId", ''))
  WHERE "revokedAt" IS NULL;
-- La capacidad VOLUNTEERS deja de estar reservada (COMMUNICATIONS y DOCUMENTS siguen bloqueadas).
ALTER TABLE "Event" DROP CONSTRAINT "Event_capabilities_reserved";
ALTER TABLE "Event" ADD CONSTRAINT "Event_capabilities_reserved"
  CHECK (NOT ("capabilities" && ARRAY['COMMUNICATIONS', 'DOCUMENTS']::"EventCapability"[]));
