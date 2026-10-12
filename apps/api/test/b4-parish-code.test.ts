/**
 * B4 — Código institucional de la parroquia, búsqueda por código, QR y cartel imprimible. Tests sin base de datos:
 * funciones puras, generación real del PDF y reglas verificadas sobre la fuente y la migración.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PARISH_CODE_PATTERN, normalizeParishCode } from "@peregrinos/shared";

// Entorno mínimo para importar módulos que leen la configuración (no se conecta a ninguna base).
process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-0000";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
process.env.WEB_ORIGIN = "https://peregrinos.example";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const migration = read("prisma/migrations/20261016000000_parish_code/migration.sql");
const schema = read("prisma/schema.prisma");
const pub = read("src/routes/public.ts");
const org = read("src/routes/organization.ts");

describe("B4: formato y normalización del código", () => {
  it("acepta lo que se dicta o se escribe y devuelve PAR-######", () => {
    for (const v of ["PAR-482193", "par 482193", "482193", " Par-482-193 ", "PAR482193"]) assert.equal(normalizeParishCode(v), "PAR-482193", v);
  });
  it("rechaza textos que no son un código (no busca por aproximación)", () => {
    for (const v of ["", "PAR-48219", "PAR-4821934", "PAX-482193", "San José", "PAR-48219A"]) assert.equal(normalizeParishCode(v), null, v);
  });
  it("el patrón coincide con el CHECK de la base", () => {
    assert.ok(PARISH_CODE_PATTERN.test("PAR-000123"));
    assert.match(migration, /CHECK \("code" ~ '\^PAR-\[0-9\]\{6\}\$'\)/);
  });
});

describe("B4: migración y modelo", () => {
  it("aditiva: completa las organizaciones existentes antes de exigir NOT NULL y unicidad", () => {
    const add = migration.indexOf('ADD COLUMN "code" TEXT;');
    const fill = migration.indexOf('UPDATE "Organization" SET "code" = gen_parish_code()');
    const notNull = migration.indexOf('ALTER COLUMN "code" SET NOT NULL');
    const unique = migration.indexOf('CREATE UNIQUE INDEX "Organization_code_key"');
    assert.ok(add > 0 && add < fill && fill < notNull && notNull < unique);
    assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|TRUNCATE/);
  });
  it("altas simultáneas serializadas y sin repetir códigos", () => {
    assert.match(migration, /pg_advisory_xact_lock\(hashtext\('gen_parish_code'\)\)/);
    assert.match(migration, /EXIT WHEN NOT EXISTS \(SELECT 1 FROM "Organization" WHERE "code" = candidate\)/);
    assert.match(migration, /ALTER COLUMN "code" SET DEFAULT gen_parish_code\(\)/);
  });
  it("el código es permanente: un trigger rechaza cambiarlo", () => {
    assert.match(migration, /BEFORE UPDATE OF "code" ON "Organization"/);
    assert.match(migration, /IF NEW\."code" IS DISTINCT FROM OLD\."code" THEN/);
  });
  it("Prisma lo modela único y generado por la base (ningún camino de alta lo inventa)", () => {
    assert.match(schema, /code String @unique @default\(dbgenerated\("gen_parish_code\(\)"\)\)/);
    assert.doesNotMatch(read("src/routes/platform.ts") + read("src/routes/auth.ts"), /code: .*PAR-/);
  });
});

describe("B4: API pública", () => {
  it("la búsqueda con un código completo devuelve solo esa parroquia aprobada", () => {
    assert.match(pub, /const code = q \? normalizeParishCode\(q\) : null;/);
    assert.match(pub, /status: "APPROVED",\s*\.\.\.\(code \? \{ code \} :/);
  });
  it("by-code resuelve solo parroquias aprobadas y responde 404 si no existe", () => {
    const r = pub.slice(pub.indexOf('"/parishes/by-code/:code"'), pub.indexOf('"/parishes/:id/qr.svg"'));
    assert.match(r, /where: \{ code, status: "APPROVED" \}/);
    assert.match(r, /throw notFound\(/);
    assert.match(r, /select: \{ id: true, code: true, name: true \}/);
  });
  it("el QR del perfil apunta al buscador con el código (el mismo enlace del cartel)", () => {
    assert.match(pub, /QRCode\.toString\(parishCodeUrl\(org\.code\)/);
  });
});

describe("B4: cartel", () => {
  it("solo el SUPERADMIN de la parroquia, con la parroquia aprobada, auditado", () => {
    const r = org.slice(org.indexOf('app.get("/poster.pdf"'), org.indexOf("/* ---------- B1: avisos"));
    assert.match(r, /preHandler: \[app\.authenticate, requireSuperadmin\]/);
    assert.match(r, /org\.status !== "APPROVED"/);
    assert.match(r, /action: "ORGANIZATION_POSTER_EXPORTED"/);
    assert.match(r, /where: \{ id: req\.auth\.organizationId \}/);
  });
  it("genera un PDF A4 y uno A3 con el enlace al código", async () => {
    const { buildParishPosterPdf, parishCodeUrl } = await import("../src/lib/parishPoster");
    assert.equal(parishCodeUrl("PAR-482193"), "https://peregrinos.example/parroquias?codigo=PAR-482193");
    const data = { name: "Parroquia Nuestra Señora de Luján", code: "PAR-482193", address: "Av. Siempreviva 742, Córdoba", logo: null };
    const a4 = await buildParishPosterPdf(data, "A4");
    const a3 = await buildParishPosterPdf(data, "A3");
    for (const pdf of [a4, a3]) assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.match(a4.toString("latin1"), /\/MediaBox \[0 0 595\.28 841\.89\]/);
    assert.match(a3.toString("latin1"), /\/MediaBox \[0 0 841\.89 1190\.55\]/);
  });
});
