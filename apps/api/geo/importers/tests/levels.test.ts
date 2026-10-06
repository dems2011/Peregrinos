import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildCatalog } from "../build/catalog";
import { contrastLevels, loadLevelsFile, toCanonicalLevels } from "../build/levels";
import { DOWNLOADS_DIR } from "../core/files";
import type { CanonicalArea } from "../core/model";
import { validateLevels } from "../core/validate";

const hasDownloads = fs.existsSync(path.join(DOWNLOADS_DIR, "S6-georef-localidades__localidades.json"));
const L = { es: "x", en: "x", pt: "x", it: "x" };
const area = (rank: number, categoria: string): CanonicalArea => ({
  countryCode: "AR", rank, kind: rank === 3 ? "LOCALITY" : "ADMIN", parent: null, isoCode: null, source: "T", sourceId: `${rank}-${categoria}-${Math.random()}`,
  name: "n", nameNormalized: "n", latitude: null, longitude: null, isActive: true, disposition: "OK", sourceExtra: { categoria },
});

describe("niveles: propuestas AR y VE", () => {
  for (const cc of ["AR", "VE"]) {
    it(`${cc}: niveles válidos, todos PENDING y PROVISIONAL`, () => {
      const levels = toCanonicalLevels(loadLevelsFile(cc));
      assert.ok(levels.length >= 3);
      assert.ok(levels.every((l) => l.reviewStatus === "PENDING" && l.status === "PROVISIONAL"));
      assert.deepEqual(validateLevels(levels, new Set([cc])), []);
    });
  }
  it("VE no tiene nivel LOCALITY (decisión de arquitectura)", () => {
    assert.ok(toCanonicalLevels(loadLevelsFile("VE")).every((l) => l.kind === "ADMIN"));
  });
});

describe("contraste de niveles (sintético)", () => {
  const file = {
    status: "PROVISIONAL", countryCode: "AR",
    levels: [
      { rank: 1, kind: "ADMIN" as const, isRequired: true, labels: L, contrast: { source: "GEOREF", expectedCount: 2, expectedCategories: ["Provincia"] } },
      { rank: 2, kind: "ADMIN" as const, isRequired: false, labels: L, contrast: { source: "GEOREF", expectedCount: 1, expectedCategories: ["Departamento"] } },
      { rank: 3, kind: "LOCALITY" as const, isRequired: false, labels: L, contrast: { source: "OTRA" } },
    ],
  };
  const areas = [area(1, "Provincia"), area(1, "Provincia"), area(2, "Barrio")];
  const [r1, r2, r3] = contrastLevels(file, { areas, iso3166_2: [] });
  it("MATCH cuando cantidad y categorías coinciden", () => assert.equal(r1.status, "MATCH"));
  it("MISMATCH con categoría no prevista", () => { assert.equal(r2.status, "MISMATCH"); assert.match(r2.detail, /Barrio/); });
  it("fuente no aprobada → PENDING_SOURCE, sin inferir", () => { assert.equal(r3.status, "PENDING_SOURCE"); assert.equal(r3.observed, null); });
  it("ISO3166-2 cuenta subdivisiones del país por tipo", () => {
    const [x] = contrastLevels(
      { status: "PROVISIONAL", countryCode: "VE", levels: [{ rank: 1, kind: "ADMIN", isRequired: true, labels: L, contrast: { source: "ISO3166-2", expectedCount: 2, iso3166_2Types: ["State"] } }] },
      { areas: [], iso3166_2: [{ code: "VE-B", name: "b", type: "State", parent: null }, { code: "VE-C", name: "c", type: "State", parent: null }, { code: "VE-W", name: "w", type: "Federal dependency", parent: null }, { code: "AR-C", name: "c", type: "State", parent: null }] },
    );
    assert.equal(x.observed, 2);
    assert.equal(x.status, "MATCH");
  });
});

describe("contraste de niveles (archivos reales verificados)", { skip: !hasDownloads && "faltan descargas locales" }, () => {
  const cat = buildCatalog();
  const get = (cc: string, rank: number) => cat.levelContrasts.find((c) => c.countryCode === cc && c.rank === rank)!;
  it("AR: los 3 niveles coinciden con Georef (24 / 529 / 3 349)", () => {
    assert.deepEqual([1, 2, 3].map((r) => [get("AR", r).status, get("AR", r).observed]), [["MATCH", 24], ["MATCH", 529], ["MATCH", 3349]]);
  });
  it("VE: rango 1 coincide con ISO 3166-2 (25); rangos 2 y 3 sin fuente aprobada", () => {
    assert.equal(get("VE", 1).status, "MATCH");
    assert.equal(get("VE", 1).observed, 25);
    assert.equal(get("VE", 2).status, "PENDING_SOURCE");
    assert.equal(get("VE", 3).status, "PENDING_SOURCE");
  });
  it("6 niveles en total, todos PENDING; VE sin áreas en esta fase", () => {
    assert.equal(cat.levels.length, 6);
    assert.ok(cat.levels.every((l) => l.reviewStatus === "PENDING"));
    assert.equal(cat.areas.filter((a) => a.countryCode === "VE").length, 0);
  });
});
