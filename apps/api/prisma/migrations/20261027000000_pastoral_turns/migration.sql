-- Turnos que SIGyP pide decidir al sacerdote (2026-10-27). ADITIVA: un valor nuevo de NotificationKind y dos tablas
-- nuevas; no modifica ni borra datos existentes. Sin datos de contacto (solo lo necesario para decidir).
-- Rollback conceptual (antes de que existan datos): DROP de "PastoralTurnDecision" y "PastoralTurn" (el valor del enum
-- no se usa en otra parte y puede quedar).

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'TURN_REQUEST';

-- CreateTable
CREATE TABLE "PastoralTurn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL DEFAULT 'SIGYP',
    "sourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedVersion" INTEGER,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "pushStatus" TEXT,
    "pushAttempts" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PastoralTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PastoralTurnDecision" (
    "seq" SERIAL NOT NULL,
    "organizationId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedByName" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PastoralTurnDecision_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "PastoralTurn_organizationId_status_startsAt_idx" ON "PastoralTurn"("organizationId", "status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PastoralTurn_organizationId_sourceSystem_sourceId_key" ON "PastoralTurn"("organizationId", "sourceSystem", "sourceId");

-- CreateIndex
CREATE INDEX "PastoralTurnDecision_organizationId_seq_idx" ON "PastoralTurnDecision"("organizationId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "PastoralTurnDecision_turnId_version_key" ON "PastoralTurnDecision"("turnId", "version");

-- AddForeignKey
ALTER TABLE "PastoralTurn" ADD CONSTRAINT "PastoralTurn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastoralTurnDecision" ADD CONSTRAINT "PastoralTurnDecision_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "PastoralTurn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Coherencia (la API valida lo mismo; la base lo garantiza).
ALTER TABLE "PastoralTurn" ADD CONSTRAINT "PastoralTurn_status_check" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'));
ALTER TABLE "PastoralTurn" ADD CONSTRAINT "PastoralTurn_source_check" CHECK ("sourceSystem" = 'SIGYP' AND "version" >= 1);
ALTER TABLE "PastoralTurn" ADD CONSTRAINT "PastoralTurn_dates_check" CHECK ("endsAt" > "startsAt");
-- Decidido ⇔ quién, cuándo y sobre qué versión; rechazado ⇒ con motivo.
ALTER TABLE "PastoralTurn" ADD CONSTRAINT "PastoralTurn_decision_check" CHECK (
  ("status" IN ('ACCEPTED', 'REJECTED')) = ("decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decidedVersion" IS NOT NULL)
  AND ("status" <> 'REJECTED' OR "reason" IS NOT NULL));
ALTER TABLE "PastoralTurn" ADD CONSTRAINT "PastoralTurn_push_check" CHECK ("pushStatus" IS NULL OR "pushStatus" IN ('SENT', 'FAILED', 'NO_DEVICES', 'NOT_CONFIGURED'));
ALTER TABLE "PastoralTurnDecision" ADD CONSTRAINT "PastoralTurnDecision_check" CHECK ("decision" IN ('ACCEPTED', 'REJECTED') AND ("decision" <> 'REJECTED' OR "reason" IS NOT NULL) AND "version" >= 1);
