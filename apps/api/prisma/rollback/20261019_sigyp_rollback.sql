-- Reversión de las migraciones 28 (20261019000000_sigyp_integration) y 29 (20261019000100_sigyp_link_events_notices).
-- SOLO para volver atrás ANTES de que exista información de SIGyP: si hay algún dato que se perdería, se aborta sin
-- cambiar nada (credenciales, códigos, cartelera, eventos o avisos de SIGyP, perfil administrado, horarios cargados o
-- avisos con entrega INBOX/urgente/grupos). Todo en una transacción; también borra los registros de esas dos migraciones
-- en _prisma_migrations para que `prisma migrate deploy` pueda volver a aplicarlas.
-- Probado en PostgreSQL 18 (.e2e-local/migraciones-actualizacion.sh). En producción: solo con autorización expresa,
-- después de una rama de Neon de respaldo, y con el código anterior (sin SIGyP) ya desplegado.
BEGIN;

DO $$
DECLARE n bigint;
BEGIN
  SELECT (SELECT count(*) FROM "IntegrationClient") + (SELECT count(*) FROM "IntegrationLinkCode") + (SELECT count(*) FROM "ParishAnnouncement")
       + (SELECT count(*) FROM "Event" WHERE "sourceSystem" IS NOT NULL OR "attendanceMode" IS NOT NULL OR "onlineUrl" IS NOT NULL)
       + (SELECT count(*) FROM "Notification" WHERE "sourceSystem" IS NOT NULL OR "delivery" <> 'PUSH' OR "urgent" OR "audience" IS NOT NULL)
       + (SELECT count(*) FROM "Organization" WHERE "profileSource" IS NOT NULL OR "officeHours" IS NOT NULL OR "profileSyncedVersion" <> 0)
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'Reversión abortada: hay % filas con datos de SIGyP o de las columnas nuevas que se perderían', n;
  END IF;
END $$;

DROP TABLE "IntegrationLinkCode";
DROP TABLE "ParishAnnouncement";
DROP TABLE "IntegrationClient";
-- Las columnas arrastran sus índices y restricciones CHECK.
ALTER TABLE "Event" DROP COLUMN "attendanceMode", DROP COLUMN "onlineUrl", DROP COLUMN "sourceId", DROP COLUMN "sourceSystem", DROP COLUMN "sourceVersion";
ALTER TABLE "Notification" DROP COLUMN "audience", DROP COLUMN "delivery", DROP COLUMN "sourceId", DROP COLUMN "sourceSystem", DROP COLUMN "urgent";
ALTER TABLE "Organization" DROP COLUMN "officeHours", DROP COLUMN "profileSource", DROP COLUMN "profileSyncedAt", DROP COLUMN "profileSyncedVersion";
DELETE FROM "_prisma_migrations" WHERE "migration_name" IN ('20261019000000_sigyp_integration', '20261019000100_sigyp_link_events_notices');

COMMIT;
