-- Comprobantes de pago dentro de la base. Hasta ahora el archivo se guardaba en el disco del servidor (UPLOAD_DIR),
-- que en Render (sin disco persistente) y en Cloud Run se pierde en cada despliegue o reinicio. Igual que MediaAsset,
-- los comprobantes nuevos guardan sus bytes en esta columna. Aditiva: los existentes quedan con "data" NULL y se siguen
-- leyendo del disco mientras el archivo exista.
-- Rollback conceptual: ALTER TABLE "PaymentProof" DROP COLUMN "data";

-- AlterTable
ALTER TABLE "PaymentProof" ADD COLUMN "data" BYTEA;
