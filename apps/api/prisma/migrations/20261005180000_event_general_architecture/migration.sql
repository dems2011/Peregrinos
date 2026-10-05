-- Fase 1: arquitectura general de eventos. Solo agrega; no borra ni renombra nada.

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PILGRIMAGE', 'PROCESSION', 'PATRONAL_FEAST', 'LITURGICAL_CELEBRATION', 'ROSARY', 'RETREAT', 'GATHERING', 'COMMUNITY_ACTIVITY', 'CULTURAL_ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- AlterEnum
-- DRAFT va antes de SCHEDULED (mismo orden que schema.prisma). Ninguna fila existente lo usa.
ALTER TYPE "EventStatus" ADD VALUE 'DRAFT' BEFORE 'SCHEDULED';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "address" TEXT,
ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "certificateEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "certificatePhrase" TEXT,
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "locationName" TEXT,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "registrationClosesAt" TIMESTAMP(3),
ADD COLUMN     "registrationOpensAt" TIMESTAMP(3),
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "type" "EventType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "visibility" "EventVisibility" NOT NULL DEFAULT 'PRIVATE';

-- CreateTable
CREATE TABLE "EventRoute" (
    "eventId" TEXT NOT NULL,
    "originName" TEXT,
    "originAddress" TEXT,
    "originLat" DOUBLE PRECISION,
    "originLng" DOUBLE PRECISION,
    "destinationName" TEXT,
    "destinationAddress" TEXT,
    "destinationLat" DOUBLE PRECISION,
    "destinationLng" DOUBLE PRECISION,
    "distanceKm" DECIMAL(7,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRoute_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "Event_organizationId_type_idx" ON "Event"("organizationId", "type");

-- AddForeignKey
ALTER TABLE "EventRoute" ADD CONSTRAINT "EventRoute_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Datos existentes: todos los eventos previos se crearon como peregrinaciones.
-- Solo se completa el tipo; estado, inscripción y demás datos quedan intactos.
UPDATE "Event" SET "type" = 'PILGRIMAGE';
