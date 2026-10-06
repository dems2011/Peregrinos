-- A5.0: identidad global multi-organización. Aditiva: no modifica datos existentes.
-- La Person de una cuenta (User.personId) es la identidad global y no cambia. Cuando el titular canjea el código que
-- emitió una organización (y confirma), el registro de esa organización se une a la identidad global y queda
-- registrado aquí exactamente qué se movió, para que SOLO esa organización pueda revertirlo.

-- CreateTable
CREATE TABLE "PersonClaim" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sourcePersonId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movedParticipantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "movedRegistrationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,

    CONSTRAINT "PersonClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonClaim_personId_organizationId_idx" ON "PersonClaim"("personId", "organizationId");

-- CreateIndex
CREATE INDEX "PersonClaim_sourcePersonId_idx" ON "PersonClaim"("sourcePersonId");

-- AddForeignKey
ALTER TABLE "PersonClaim" ADD CONSTRAINT "PersonClaim_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonClaim" ADD CONSTRAINT "PersonClaim_sourcePersonId_fkey" FOREIGN KEY ("sourcePersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonClaim" ADD CONSTRAINT "PersonClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonClaim" ADD CONSTRAINT "PersonClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deny-by-default (Prisma no representa CHECK ni índices parciales).
-- Un registro de organización solo puede estar unido una vez a la vez (una unión vigente por registro).
CREATE UNIQUE INDEX "PersonClaim_active_source_unique" ON "PersonClaim"("sourcePersonId") WHERE "reversedAt" IS NULL;
-- Nunca se une una Person consigo misma; revertir deja constancia de quién lo hizo.
ALTER TABLE "PersonClaim" ADD CONSTRAINT "PersonClaim_distinct_persons" CHECK ("personId" <> "sourcePersonId");
ALTER TABLE "PersonClaim" ADD CONSTRAINT "PersonClaim_reversal_complete"
  CHECK (("reversedAt" IS NULL AND "reversedById" IS NULL) OR ("reversedAt" IS NOT NULL AND "reversedById" IS NOT NULL));
