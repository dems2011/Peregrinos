-- A5.1: consentimiento de voluntariado entre organizaciones.
-- La cuenta genera un código (hash, vence, un solo uso); una organización lo canjea para UN evento (solicitud
-- pendiente, sin datos de la persona); la persona acepta (crea la VolunteerParticipation) o rechaza.
-- Aditiva: solo crea una tabla nueva. No transforma ni borra datos existentes.
-- CreateTable
CREATE TABLE "VolunteerConsentCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "eventId" TEXT,
    "requestedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "volunteerId" TEXT,

    CONSTRAINT "VolunteerConsentCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerConsentCode_codeHash_key" ON "VolunteerConsentCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerConsentCode_volunteerId_key" ON "VolunteerConsentCode"("volunteerId");

-- CreateIndex
CREATE INDEX "VolunteerConsentCode_userId_createdAt_idx" ON "VolunteerConsentCode"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VolunteerConsentCode_eventId_idx" ON "VolunteerConsentCode"("eventId");

-- AddForeignKey
ALTER TABLE "VolunteerConsentCode" ADD CONSTRAINT "VolunteerConsentCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerConsentCode" ADD CONSTRAINT "VolunteerConsentCode_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerConsentCode" ADD CONSTRAINT "VolunteerConsentCode_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerConsentCode" ADD CONSTRAINT "VolunteerConsentCode_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "VolunteerParticipation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Canje completo: consumido ⇔ evento y personal que lo canjeó.
ALTER TABLE "VolunteerConsentCode" ADD CONSTRAINT "VolunteerConsentCode_request_complete"
  CHECK (("usedAt" IS NULL) = ("eventId" IS NULL) AND ("usedAt" IS NULL) = ("requestedById" IS NULL));
-- La persona solo responde a una solicitud existente, y una sola vez.
ALTER TABLE "VolunteerConsentCode" ADD CONSTRAINT "VolunteerConsentCode_answer_after_request"
  CHECK (("acceptedAt" IS NULL AND "declinedAt" IS NULL) OR "usedAt" IS NOT NULL);
ALTER TABLE "VolunteerConsentCode" ADD CONSTRAINT "VolunteerConsentCode_single_answer"
  CHECK (NOT ("acceptedAt" IS NOT NULL AND "declinedAt" IS NOT NULL));
-- Aceptada ⇔ asociada al voluntariado que creó.
ALTER TABLE "VolunteerConsentCode" ADD CONSTRAINT "VolunteerConsentCode_accept_complete"
  CHECK (("acceptedAt" IS NULL) = ("volunteerId" IS NULL));
