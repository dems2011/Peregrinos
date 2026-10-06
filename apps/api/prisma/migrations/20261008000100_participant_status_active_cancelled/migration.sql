-- A4: Participant solo puede estar ACTIVE o CANCELLED (se elimina INACTIVE del enum).
-- Conservadora: NO transforma ni borra filas. Si existe alguna participación INACTIVE la migración
-- se aborta con un mensaje explícito y no cambia nada; esos datos requieren una decisión antes de desplegar.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "Participant" WHERE "status"::text = 'INACTIVE';
  IF n > 0 THEN
    RAISE EXCEPTION 'A4: hay % participación(es) INACTIVE. Decide su conversión antes de aplicar esta migración (no se transforman automáticamente).', n;
  END IF;
END $$;

-- AlterEnum (mismo patrón que genera Prisma al quitar un valor)
CREATE TYPE "ParticipantStatus_new" AS ENUM ('ACTIVE', 'CANCELLED');
ALTER TABLE "Participant" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Participant" ALTER COLUMN "status" TYPE "ParticipantStatus_new" USING ("status"::text::"ParticipantStatus_new");
ALTER TYPE "ParticipantStatus" RENAME TO "ParticipantStatus_old";
ALTER TYPE "ParticipantStatus_new" RENAME TO "ParticipantStatus";
DROP TYPE "ParticipantStatus_old";
ALTER TABLE "Participant" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
