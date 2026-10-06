import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, DOWNLOADS_DIR } from "../core/files";
import { buildGeorefAreas, loadGeorefInput, type GeorefInput } from "../sources/georef";

const hasDownloads = fs.existsSync(path.join(DOWNLOADS_DIR, "S6-georef-localidades__localidades.json"));

// Datos sintéticos con la forma real de Georef (incluida CABA).
const input: GeorefInput = {
  provincias: [{ id: "02", nombre: "Ciudad Autónoma de Buenos Aires", categoria: "Ciudad Autónoma", iso_id: "AR-C", centroide: { lat: -34.6, lon: -58.4 } }],
  departamentos: [
    { id: "02049", nombre: "Comuna 7", categoria: "Comuna", provincia: { id: "02", nombre: "Ciudad Autónoma de Buenos Aires" }, centroide: { lat: -34.6, lon: -58.4 } },
    { id: "99001", nombre: "Huérfano", categoria: "Departamento", provincia: { id: "99" } },
  ],
  localidades: [
    { id: "0204901001", nombre: "Flores", categoria: "Entidad", provincia: { id: "02" }, departamento: { id: "02049" }, localidad_censal: { id: "02049010", nombre: "CABA - Comuna 7" } },
    { id: "02049010", nombre: "Localidad de prueba", categoria: "Componente de localidad compuesta", provincia: { id: "02" }, departamento: { id: "02049" }, localidad_censal: { id: "02049010" } },
    { id: "02049099", nombre: "Sin departamento", categoria: "Localidad simple", provincia: { id: "02" }, departamento: { id: null } },
    { id: "02049098", nombre: "Provincia incoherente", categoria: "Localidad simple", provincia: { id: "06" }, departamento: { id: "02049" } },
    { id: "02049097", nombre: "Retenida", categoria: "Localidad simple", provincia: { id: "02" }, departamento: { id: "02049" } },
    { id: "123", nombre: "Formato raro", categoria: "?", provincia: { id: "02" }, departamento: { id: "02049" } },
  ],
};
const r = buildGeorefAreas(input, { "localidades:02049097": { reason: "prueba" }, "localidades:02049010x": { reason: "no aplica" } });
const rx = buildGeorefAreas(input, { "localidades:02049010": { reason: "conflicto", decision: "EXCLUDE", decisionNote: "decisión aprobada" } });
const byId = (sid: string) => r.areas.find((a) => a.sourceId === sid);
const ex = (sid: string) => r.excluded.find((e) => e.sourceId === sid);

describe("Georef (sintético): reglas de la fase", () => {
  it("CABA sin arquitectura especial: AR-C → Comuna → localidad por relaciones explícitas", () => {
    assert.equal(byId("provincias:02")?.isoCode, "AR-C");
    assert.deepEqual(byId("departamentos:02049")?.parent, { source: "GEOREF", sourceId: "provincias:02" });
    assert.deepEqual(byId("localidades:02049010")?.parent, { source: "GEOREF", sourceId: "departamentos:02049" });
    assert.equal(byId("localidades:02049010")?.kind, "LOCALITY");
  });
  it("las Entidades de 10 dígitos se excluyen y conservan su localidad_censal", () => {
    assert.equal(byId("localidades:0204901001"), undefined);
    assert.equal(ex("localidades:0204901001")?.disposition, "EXCLUDED");
    assert.equal(ex("localidades:0204901001")?.sourceExtra?.localidad_censal, "02049010");
  });
  it("sin departamento resoluble → REVIEW_REQUIRED (nunca inferencia)", () => assert.equal(ex("localidades:02049099")?.disposition, "REVIEW_REQUIRED"));
  it("provincia incoherente con la del departamento → REVIEW_REQUIRED", () => assert.equal(ex("localidades:02049098")?.disposition, "REVIEW_REQUIRED"));
  it("retención explícita de revisión → REVIEW_REQUIRED", () => assert.match(ex("localidades:02049097")!.reason, /Retenido para revisión/));
  it("id con formato no previsto → REJECTED", () => assert.equal(ex("localidades:123")?.disposition, "REJECTED"));
  it("departamento con provincia inexistente → REJECTED", () => assert.equal(ex("departamentos:99001")?.disposition, "REJECTED"));
  it("no se crea un cuarto nivel", () => assert.ok(r.areas.every((a) => a.rank <= 3)));
  it("decision=EXCLUDE excluye el registro (EXCLUDED, no REVIEW_REQUIRED) y no lo asigna a ninguna comuna", () => {
    assert.equal(rx.areas.find((a) => a.sourceId === "localidades:02049010"), undefined);
    const e = rx.excluded.find((x) => x.sourceId === "localidades:02049010");
    assert.equal(e?.disposition, "EXCLUDED");
    assert.match(e!.reason, /decisión aprobada/);
  });
});

describe("Georef (archivos reales verificados)", { skip: !hasDownloads && "faltan descargas locales" }, () => {
  const real = buildGeorefAreas(loadGeorefInput(), JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "georef-review.json"), "utf8")).review);
  const count = (rank: number) => real.areas.filter((a) => a.rank === rank).length;
  it("24 provincias, 529 departamentos y 3 349 localidades de 8 dígitos", () => {
    assert.equal(count(1), 24); assert.equal(count(2), 529); assert.equal(count(3), 3349);
  });
  it("678 Entidades de 10 dígitos excluidas; ninguna convertida en área", () => {
    assert.equal(real.excluded.filter((e) => e.disposition === "EXCLUDED" && /10 dígitos/.test(e.reason)).length, 678);
    assert.ok(real.areas.every((a) => !/^localidades:[0-9]{10}$/.test(a.sourceId)));
  });
  it("CABA: 15 comunas, 0 localidades («Ciudad de Buenos Aires» excluida por decisión), 48 entidades excluidas", () => {
    assert.equal(real.areas.filter((a) => a.rank === 2 && a.parent?.sourceId === "provincias:02").length, 15);
    assert.equal(real.areas.filter((a) => a.rank === 3 && a.parent?.sourceId.startsWith("departamentos:02")).length, 0);
    assert.equal(real.excluded.find((e) => e.sourceId === "localidades:02014010")?.disposition, "EXCLUDED");
    assert.equal(real.excluded.filter((e) => e.disposition === "EXCLUDED" && e.sourceExtra?.provincia === "02" && /10 dígitos/.test(e.reason)).length, 48);
    assert.equal(real.excluded.filter((e) => e.disposition === "REVIEW_REQUIRED").length, 0);
  });
  it("sin homónimos entre las localidades de 8 dígitos bajo un mismo departamento", () => {
    const seen = new Set<string>();
    for (const a of real.areas.filter((x) => x.rank === 3)) { const k = `${a.parent?.sourceId}|${a.nameNormalized}`; assert.ok(!seen.has(k), k); seen.add(k); }
  });
});
