-- A4a: Person (identidad humana) ≠ User (cuenta) ≠ Participant (participación) ≠ Registration (inscripción).
-- Conservadora: no borra, no trunca y no modifica columnas existentes; solo crea Person y completa los personId nuevos.
--
-- Backfill determinista y SIN fusiones (nunca se infiere que dos filas son la misma persona por nombre o documento):
--   1. Cada cuenta PILGRIM recibe su Person (id = User.id), controlada por su titular (ownerOrganizationId NULL).
--      El nombre de la cuenta se copia entero en firstName (lastName NULL): no se parte un nombre completo.
--   2. Cada Participant usa la Person de su cuenta PILGRIM si ya estaba vinculado (userId), si no una Person propia
--      (id = Participant.id) que pertenece a la organización del evento.
--   3. Cada Registration usa la Person de su Participant si ya fue aprobada, si no la de su cuenta (userId),
--      si no una Person propia (id = Registration.id) de la organización del evento.
--   Los posibles duplicados quedan como personas distintas: el personal los fusiona de forma explícita y auditada.
--
-- Rollback conceptual (antes de que existan datos nuevos que dependan de Person): quitar los CHECK, FK e índices
-- nuevos, las columnas "personId" de User/Participant/Registration y la tabla "Person". Ningún dato previo cambió.

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "documentType" TEXT,
    "documentNumber" TEXT,
    "phone" TEXT,
    "phoneDigits" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "birthDate" DATE,
    "ownerOrganizationId" TEXT,
    "mergedIntoId" TEXT,
    "claimCodeHash" TEXT,
    "claimCodeExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- AlterTable: columnas nuevas, primero opcionales para completar el backfill.
ALTER TABLE "User" ADD COLUMN     "personId" TEXT;
ALTER TABLE "Participant" ADD COLUMN     "personId" TEXT;
ALTER TABLE "Registration" ADD COLUMN     "personId" TEXT;

-- Backfill 1: cuentas PILGRIM.
INSERT INTO "Person" ("id", "firstName", "lastName", "documentType", "documentNumber", "phone", "phoneDigits", "email", "ownerOrganizationId", "createdAt", "updatedAt")
SELECT u."id", u."name", NULL, NULL, NULLIF(u."documentNumber", ''), u."phone",
       COALESCE(regexp_replace(u."phone", '[^0-9]', '', 'g'), ''), u."email", NULL, u."createdAt", CURRENT_TIMESTAMP
FROM "User" u WHERE u."accountType" = 'PILGRIM';
UPDATE "User" SET "personId" = "id" WHERE "accountType" = 'PILGRIM';

-- Backfill 2: participantes.
UPDATE "Participant" p SET "personId" = u."personId"
FROM "User" u WHERE p."userId" = u."id" AND u."personId" IS NOT NULL;
INSERT INTO "Person" ("id", "firstName", "lastName", "documentType", "documentNumber", "phone", "phoneDigits", "email", "ownerOrganizationId", "createdAt", "updatedAt")
SELECT p."id", p."firstName", p."lastName", p."documentType", NULLIF(p."documentNumber", ''), p."phone", p."phoneDigits", NULL,
       e."organizationId", p."createdAt", CURRENT_TIMESTAMP
FROM "Participant" p JOIN "Event" e ON e."id" = p."eventId" WHERE p."personId" IS NULL;
UPDATE "Participant" SET "personId" = "id" WHERE "personId" IS NULL;

-- Backfill 3: inscripciones.
UPDATE "Registration" r SET "personId" = p."personId"
FROM "Participant" p WHERE r."participantId" = p."id";
UPDATE "Registration" r SET "personId" = u."personId"
FROM "User" u WHERE r."personId" IS NULL AND r."userId" = u."id" AND u."personId" IS NOT NULL;
INSERT INTO "Person" ("id", "firstName", "lastName", "documentType", "documentNumber", "phone", "phoneDigits", "email", "ownerOrganizationId", "createdAt", "updatedAt")
SELECT r."id", r."firstName", r."lastName", r."documentType", NULLIF(r."documentNumber", ''), r."phone", r."phoneDigits", NULL,
       e."organizationId", r."createdAt", CURRENT_TIMESTAMP
FROM "Registration" r JOIN "Event" e ON e."id" = r."eventId" WHERE r."personId" IS NULL;
UPDATE "Registration" SET "personId" = "id" WHERE "personId" IS NULL;

-- Toda participación e inscripción pertenece a una Person (que puede no tener cuenta).
ALTER TABLE "Participant" ALTER COLUMN "personId" SET NOT NULL;
ALTER TABLE "Registration" ALTER COLUMN "personId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Person_claimCodeHash_key" ON "Person"("claimCodeHash");
CREATE INDEX "Person_ownerOrganizationId_lastName_firstName_idx" ON "Person"("ownerOrganizationId", "lastName", "firstName");
CREATE INDEX "Person_documentNumber_idx" ON "Person"("documentNumber");
CREATE INDEX "Person_phoneDigits_idx" ON "Person"("phoneDigits");
CREATE INDEX "Person_mergedIntoId_idx" ON "Person"("mergedIntoId");
CREATE INDEX "Participant_personId_idx" ON "Participant"("personId");
CREATE UNIQUE INDEX "Participant_eventId_personId_key" ON "Participant"("eventId", "personId");
CREATE INDEX "Registration_personId_idx" ON "Registration"("personId");
CREATE UNIQUE INDEX "Registration_eventId_personId_key" ON "Registration"("eventId", "personId");
-- Person → User = 0..1: una persona tiene como máximo una cuenta (garantizado por la BD).
CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");

-- AddForeignKey (RESTRICT: una persona con historial nunca se borra)
ALTER TABLE "Person" ADD CONSTRAINT "Person_ownerOrganizationId_fkey" FOREIGN KEY ("ownerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deny-by-default (Prisma no representa CHECK).
-- A2 + A4a: toda cuenta PILGRIM tiene su Person.
ALTER TABLE "User" ADD CONSTRAINT "User_pilgrim_has_person"
  CHECK ("accountType" <> 'PILGRIM' OR "personId" IS NOT NULL);
ALTER TABLE "Person" ADD CONSTRAINT "Person_not_merged_into_itself"
  CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id");
-- El código de vinculación siempre vence; una persona fusionada no se puede reclamar.
ALTER TABLE "Person" ADD CONSTRAINT "Person_claim_code_valid"
  CHECK ("claimCodeHash" IS NULL OR ("claimCodeExpiresAt" IS NOT NULL AND "mergedIntoId" IS NULL));
