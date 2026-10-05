-- G1: catálogo geográfico internacional (Country → CountryAreaLevel → AdministrativeArea → Address) + GeoImportRun.
-- Solo crea tipos, tablas, índices y restricciones NUEVOS. No modifica ninguna tabla existente ni carga datos.
-- Ver docs/ARQUITECTURA-INTERNACIONAL.md.

-- CreateEnum
CREATE TYPE "AreaKind" AS ENUM ('ADMIN', 'LOCALITY');

-- CreateEnum
CREATE TYPE "GeoReviewStatus" AS ENUM ('PENDING', 'VERIFIED');

-- CreateEnum
CREATE TYPE "GeoImportStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Country" (
    "code" CHAR(2) NOT NULL,
    "iso3" CHAR(3),
    "names" JSONB NOT NULL,
    "locales" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currencyCode" CHAR(3),
    "phonePrefix" TEXT,
    "timezones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" "GeoReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CountryAreaLevel" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "rank" INTEGER NOT NULL,
    "kind" "AreaKind" NOT NULL,
    "labels" JSONB NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "GeoReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryAreaLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdministrativeArea" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "rank" INTEGER NOT NULL,
    "kind" "AreaKind" NOT NULL,
    "parentId" TEXT,
    "parentCountryCode" CHAR(2),
    "parentRank" INTEGER,
    "parentKind" "AreaKind",
    "isoCode" TEXT,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdministrativeArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "areaId" TEXT,
    "areaCountryCode" CHAR(2),
    "localityText" TEXT,
    "line1" TEXT,
    "line2" TEXT,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geoSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoImportRun" (
    "id" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "countryCode" CHAR(2),
    "source" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "sha256" CHAR(64),
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "status" "GeoImportStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "insertedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "deactivatedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "triggeredBy" TEXT,

    CONSTRAINT "GeoImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso3_key" ON "Country"("iso3");

-- CreateIndex
CREATE UNIQUE INDEX "CountryAreaLevel_countryCode_rank_key" ON "CountryAreaLevel"("countryCode", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "CountryAreaLevel_countryCode_rank_kind_key" ON "CountryAreaLevel"("countryCode", "rank", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeArea_isoCode_key" ON "AdministrativeArea"("isoCode");

-- CreateIndex
CREATE INDEX "AdministrativeArea_parentId_idx" ON "AdministrativeArea"("parentId");

-- CreateIndex
CREATE INDEX "AdministrativeArea_countryCode_kind_rank_idx" ON "AdministrativeArea"("countryCode", "kind", "rank");

-- CreateIndex
CREATE INDEX "AdministrativeArea_countryCode_nameNormalized_idx" ON "AdministrativeArea"("countryCode", "nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeArea_id_countryCode_key" ON "AdministrativeArea"("id", "countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeArea_id_countryCode_rank_kind_key" ON "AdministrativeArea"("id", "countryCode", "rank", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeArea_countryCode_source_sourceId_key" ON "AdministrativeArea"("countryCode", "source", "sourceId");

-- CreateIndex
CREATE INDEX "Address_countryCode_idx" ON "Address"("countryCode");

-- CreateIndex
CREATE INDEX "Address_areaId_idx" ON "Address"("areaId");

-- CreateIndex
CREATE INDEX "GeoImportRun_countryCode_dataset_startedAt_idx" ON "GeoImportRun"("countryCode", "dataset", "startedAt");

-- CreateIndex
CREATE INDEX "GeoImportRun_source_sourceVersion_idx" ON "GeoImportRun"("source", "sourceVersion");

-- AddForeignKey
ALTER TABLE "CountryAreaLevel" ADD CONSTRAINT "CountryAreaLevel_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AdministrativeArea" ADD CONSTRAINT "AdministrativeArea_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AdministrativeArea" ADD CONSTRAINT "AdministrativeArea_countryCode_rank_kind_fkey" FOREIGN KEY ("countryCode", "rank", "kind") REFERENCES "CountryAreaLevel"("countryCode", "rank", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AdministrativeArea" ADD CONSTRAINT "AdministrativeArea_parentId_parentCountryCode_parentRank_p_fkey" FOREIGN KEY ("parentId", "parentCountryCode", "parentRank", "parentKind") REFERENCES "AdministrativeArea"("id", "countryCode", "rank", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_areaId_areaCountryCode_fkey" FOREIGN KEY ("areaId", "areaCountryCode") REFERENCES "AdministrativeArea"("id", "countryCode") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- =====================================================================================
-- CHECK escritos a mano: Prisma no los representa en schema.prisma (migrate diff los ignora).
-- Junto con las FK compuestas garantizan la integridad geográfica sin triggers:
-- mismo país que el padre, rango del padre menor (=> sin ciclos), ningún ADMIN bajo LOCALITY,
-- raíces de rango 1, coordenadas válidas y formatos de códigos.
-- =====================================================================================
ALTER TABLE "Country"
  ADD CONSTRAINT "Country_code_format"     CHECK ("code" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "Country_iso3_format"     CHECK ("iso3" IS NULL OR "iso3" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Country_currency_format" CHECK ("currencyCode" IS NULL OR "currencyCode" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Country_phone_format"    CHECK ("phonePrefix" IS NULL OR "phonePrefix" ~ '^\+[1-9][0-9]{0,3}$'),
  ADD CONSTRAINT "Country_names_object"    CHECK (jsonb_typeof("names") = 'object');
ALTER TABLE "CountryAreaLevel"
  ADD CONSTRAINT "CountryAreaLevel_rank_positive" CHECK ("rank" >= 1),
  ADD CONSTRAINT "CountryAreaLevel_labels_object" CHECK (jsonb_typeof("labels") = 'object');
ALTER TABLE "AdministrativeArea"
  ADD CONSTRAINT "AdministrativeArea_rank_positive"   CHECK ("rank" >= 1),
  ADD CONSTRAINT "AdministrativeArea_parent_all_or_none" CHECK (num_nulls("parentId","parentCountryCode","parentRank","parentKind") IN (0,4)),
  ADD CONSTRAINT "AdministrativeArea_parent_same_country" CHECK ("parentCountryCode" IS NULL OR "parentCountryCode" = "countryCode"),
  ADD CONSTRAINT "AdministrativeArea_parent_rank_lower"  CHECK ("parentRank" IS NULL OR "parentRank" < "rank"),
  ADD CONSTRAINT "AdministrativeArea_no_admin_under_locality" CHECK (NOT ("parentKind" = 'LOCALITY' AND "kind" = 'ADMIN')),
  ADD CONSTRAINT "AdministrativeArea_root_is_rank1"    CHECK ("parentId" IS NOT NULL OR "rank" = 1),
  ADD CONSTRAINT "AdministrativeArea_not_self_parent"  CHECK ("parentId" IS NULL OR "parentId" <> "id"),
  ADD CONSTRAINT "AdministrativeArea_coords_pair"      CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "AdministrativeArea_coords_range"     CHECK ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)),
  ADD CONSTRAINT "AdministrativeArea_text_not_blank"   CHECK (btrim("name") <> '' AND btrim("source") <> '' AND btrim("sourceId") <> '');
ALTER TABLE "Address"
  ADD CONSTRAINT "Address_area_all_or_none"  CHECK (num_nulls("areaId","areaCountryCode") IN (0,2)),
  ADD CONSTRAINT "Address_area_same_country" CHECK ("areaCountryCode" IS NULL OR "areaCountryCode" = "countryCode"),
  ADD CONSTRAINT "Address_coords_pair"       CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "Address_coords_range"      CHECK ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180));
ALTER TABLE "GeoImportRun"
  ADD CONSTRAINT "GeoImportRun_counts_nonneg" CHECK (LEAST("insertedCount","updatedCount","unchangedCount","deactivatedCount","errorCount") >= 0),
  ADD CONSTRAINT "GeoImportRun_sha256_format" CHECK ("sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "GeoImportRun_finished_after" CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt");
