-- A4: capacidades del evento (Event.capabilities). Aditiva: no borra ni modifica datos existentes,
-- salvo completar la columna nueva. El tipo de evento deja de decidir qué módulos usa el evento.

-- CreateEnum
CREATE TYPE "EventCapability" AS ENUM ('INFO', 'LOCATION', 'REGISTRATION', 'PARTICIPANTS', 'CHECKIN', 'ROUTE', 'POINTS', 'CONTACTS', 'CERTIFICATES', 'VOLUNTEERS', 'COMMUNICATIONS', 'DOCUMENTS');

-- AlterTable: los eventos existentes conservan todo lo que ya podían usar.
ALTER TABLE "Event" ADD COLUMN     "capabilities" "EventCapability"[] DEFAULT ARRAY['INFO', 'LOCATION', 'REGISTRATION', 'PARTICIPANTS', 'CHECKIN', 'ROUTE', 'POINTS', 'CONTACTS', 'CERTIFICATES']::"EventCapability"[];

-- Backfill: antes de A4 el trayecto solo existía en los tipos PILGRIMAGE y PROCESSION.
-- Los demás eventos quedan sin ROUTE salvo que ya tengan un trayecto guardado (se conserva).
UPDATE "Event" SET "capabilities" = array_remove("capabilities", 'ROUTE')
WHERE "type" NOT IN ('PILGRIMAGE', 'PROCESSION')
  AND NOT EXISTS (SELECT 1 FROM "EventRoute" r WHERE r."eventId" = "Event"."id");

-- Deny-by-default en la BD (Prisma no representa CHECK).
-- Siempre presente e incluye INFO (nombre y fecha son obligatorios en todo evento).
ALTER TABLE "Event" ADD CONSTRAINT "Event_capabilities_info"
  CHECK ("capabilities" IS NOT NULL AND 'INFO' = ANY ("capabilities"));
-- Reservadas para A5/A6: se habilitan quitando este CHECK en la migración del módulo correspondiente.
ALTER TABLE "Event" ADD CONSTRAINT "Event_capabilities_reserved"
  CHECK (NOT ("capabilities" && ARRAY['VOLUNTEERS', 'COMMUNICATIONS', 'DOCUMENTS']::"EventCapability"[]));
-- Dependencias del modelo de datos: aprobar una inscripción crea un Participant; Checkin referencia Participant y Checkpoint.
ALTER TABLE "Event" ADD CONSTRAINT "Event_capabilities_dependencies"
  CHECK (
    (NOT ('REGISTRATION' = ANY ("capabilities")) OR 'PARTICIPANTS' = ANY ("capabilities"))
    AND (NOT ('CHECKIN' = ANY ("capabilities")) OR ('PARTICIPANTS' = ANY ("capabilities") AND 'POINTS' = ANY ("capabilities")))
    AND (NOT ('CERTIFICATES' = ANY ("capabilities")) OR 'PARTICIPANTS' = ANY ("capabilities"))
  );
-- Datos del propio evento que solo existen con su capacidad activa.
ALTER TABLE "Event" ADD CONSTRAINT "Event_registration_requires_capability"
  CHECK (NOT "registrationOpen" OR 'REGISTRATION' = ANY ("capabilities"));
ALTER TABLE "Event" ADD CONSTRAINT "Event_certificate_requires_capability"
  CHECK (NOT "certificateEnabled" OR 'CERTIFICATES' = ANY ("capabilities"));
ALTER TABLE "Event" ADD CONSTRAINT "Event_location_requires_capability"
  CHECK (
    ("locationName" IS NULL AND "address" IS NULL AND "latitude" IS NULL AND "longitude" IS NULL)
    OR 'LOCATION' = ANY ("capabilities")
  );
