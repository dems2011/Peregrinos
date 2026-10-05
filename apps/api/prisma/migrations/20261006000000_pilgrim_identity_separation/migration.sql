-- A2: separación de identidad (User PILGRIM) y autorización del personal (STAFF).
-- Segura para datos existentes: no borra filas ni toca Participant/Registration/Event/sesiones.

-- 1. role y organizationId pasan a ser opcionales (los exigen los CHECK para STAFF).
ALTER TABLE "User" ALTER COLUMN "organizationId" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "role" DROP NOT NULL;

-- 2. Normaliza las cuentas PILGRIM existentes. Hasta A1 recibían role=OPERATOR y la PRIMERA
--    organización como valores de relleno (no representaban pertenencia ni permisos reales).
--    Sus vínculos reales (Participant.userId, Registration.userId) no se modifican.
UPDATE "User"
SET "role" = NULL, "organizationId" = NULL, "extraPermissions" = '{}'
WHERE "accountType" = 'PILGRIM';

-- 3. Reglas impuestas por la BD (deny-by-default aunque falle la aplicación).
ALTER TABLE "User" ADD CONSTRAINT "User_staff_requires_org_and_role"
  CHECK ("accountType" <> 'STAFF' OR ("organizationId" IS NOT NULL AND "role" IS NOT NULL));
ALTER TABLE "User" ADD CONSTRAINT "User_pilgrim_without_staff_authz"
  CHECK ("accountType" <> 'PILGRIM' OR ("organizationId" IS NULL AND "role" IS NULL AND COALESCE(cardinality("extraPermissions"), 0) = 0));
