-- Reversión de la migración 30 (20261027000000_pastoral_turns). Se aplica ANTES que la de 28/29 si hay que volver más
-- atrás. SOLO antes de que existan turnos: si hay turnos, decisiones o avisos TURN_REQUEST, se aborta sin cambiar nada.
-- Todo en una transacción; quita también el valor TURN_REQUEST del enum (recreándolo, porque PostgreSQL no permite
-- quitar un valor) y borra el registro de la migración para que `prisma migrate deploy` pueda volver a aplicarla.
-- Probado en PostgreSQL 18 (.e2e-local/migraciones-actualizacion.sh). En producción: solo con autorización expresa,
-- después de una rama de Neon de respaldo, y con el código anterior (sin turnos) ya desplegado.
BEGIN;

DO $$
DECLARE n bigint;
BEGIN
  SELECT (SELECT count(*) FROM "PastoralTurn") + (SELECT count(*) FROM "PastoralTurnDecision")
       + (SELECT count(*) FROM "Notification" WHERE "kind" = 'TURN_REQUEST')
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'Reversión abortada: hay % filas de turnos que se perderían', n;
  END IF;
END $$;

DROP TABLE "PastoralTurnDecision";
DROP TABLE "PastoralTurn";
ALTER TYPE "NotificationKind" RENAME TO "NotificationKind_old";
CREATE TYPE "NotificationKind" AS ENUM ('MANUAL', 'EVENT_PUBLISHED', 'LIVESTREAM', 'BULLETIN');
ALTER TABLE "Notification" ALTER COLUMN "kind" TYPE "NotificationKind" USING ("kind"::text::"NotificationKind");
DROP TYPE "NotificationKind_old";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261027000000_pastoral_turns';

COMMIT;
