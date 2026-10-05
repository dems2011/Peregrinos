-- Los eventos nuevos nacen en borrador (DRAFT) también a nivel de base de datos.
-- Va en una migración separada: PostgreSQL no permite usar un valor de enum agregado
-- (ADD VALUE 'DRAFT', migración anterior) dentro de la misma transacción.
-- Solo cambia el valor por defecto de la columna: no modifica ninguna fila existente.
ALTER TABLE "Event" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
