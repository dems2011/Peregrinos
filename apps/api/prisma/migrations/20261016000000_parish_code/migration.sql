-- B4: código institucional único y permanente de cada parroquia («PAR-» + 6 dígitos, p. ej. PAR-482193).
-- Aditiva y compatible con los datos existentes: agrega la columna, asigna un código a cada organización ya creada,
-- y desde entonces la base lo genera sola al crear una organización (DEFAULT gen_parish_code()).
-- No reemplaza códigos: un trigger impide cambiarlo una vez asignado.
-- Rollback conceptual: DROP TRIGGER "Organization_code_immutable" ON "Organization"; DROP FUNCTION
-- organization_code_immutable(); ALTER TABLE "Organization" DROP COLUMN "code"; DROP FUNCTION gen_parish_code().

-- Genera un código libre. El bloqueo transaccional serializa las altas simultáneas: la segunda espera a que la primera
-- confirme y ve su código, así la comprobación de existencia no tiene carreras. El índice único es la última garantía.
CREATE FUNCTION gen_parish_code() RETURNS TEXT
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  candidate TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('gen_parish_code'));
  LOOP
    candidate := 'PAR-' || lpad((100000 + floor(random() * 900000))::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM "Organization" WHERE "code" = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

-- AlterTable: columna nula mientras se completan las organizaciones existentes.
ALTER TABLE "Organization" ADD COLUMN "code" TEXT;

-- Una por una (cada UPDATE es una sentencia nueva: la función ve los códigos ya asignados).
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT "id" FROM "Organization" WHERE "code" IS NULL ORDER BY "createdAt", "id" LOOP
    UPDATE "Organization" SET "code" = gen_parish_code() WHERE "id" = org."id";
  END LOOP;
END;
$$;

ALTER TABLE "Organization" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "Organization" ALTER COLUMN "code" SET DEFAULT gen_parish_code();
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_code_format" CHECK ("code" ~ '^PAR-[0-9]{6}$');

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- El código es permanente: ninguna actualización puede cambiarlo.
CREATE FUNCTION organization_code_immutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code" THEN
    RAISE EXCEPTION 'El código institucional de la parroquia no se puede cambiar' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Organization_code_immutable" BEFORE UPDATE OF "code" ON "Organization"
FOR EACH ROW EXECUTE FUNCTION organization_code_immutable();
