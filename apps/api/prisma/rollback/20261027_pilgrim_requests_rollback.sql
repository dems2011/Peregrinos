-- Reversión de la migración 31 (20261027000100_pilgrim_requests). Se aplica ANTES que la de 30 (y la de 28/29) si hay
-- que volver más atrás. SOLO antes de que existan solicitudes: si hay tipos, solicitudes o avisos REQUEST_STATUS, se
-- aborta sin cambiar nada. Quita el valor REQUEST_STATUS del enum recreándolo (PostgreSQL no permite quitar un valor)
-- y borra el registro de la migración para que `prisma migrate deploy` pueda volver a aplicarla.
-- Probado en PostgreSQL 18 (.e2e-local/migraciones-actualizacion.sh). En producción: solo con autorización expresa,
-- después de una rama de Neon de respaldo, y con el código anterior (sin solicitudes) ya desplegado.
BEGIN;

DO $$
DECLARE n bigint;
BEGIN
  SELECT (SELECT count(*) FROM "ParishRequestType") + (SELECT count(*) FROM "PilgrimRequest")
       + (SELECT count(*) FROM "Notification" WHERE "kind" = 'REQUEST_STATUS')
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'Reversión abortada: hay % filas de solicitudes que se perderían', n;
  END IF;
END $$;

DROP TABLE "PilgrimRequest";
DROP TABLE "ParishRequestType";
ALTER TYPE "NotificationKind" RENAME TO "NotificationKind_old";
CREATE TYPE "NotificationKind" AS ENUM ('MANUAL', 'EVENT_PUBLISHED', 'LIVESTREAM', 'BULLETIN', 'TURN_REQUEST');
ALTER TABLE "Notification" ALTER COLUMN "kind" TYPE "NotificationKind" USING ("kind"::text::"NotificationKind");
DROP TYPE "NotificationKind_old";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261027000100_pilgrim_requests';

COMMIT;
