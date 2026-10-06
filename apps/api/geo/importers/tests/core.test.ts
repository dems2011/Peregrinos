import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeName } from "../core/normalize";
import { validCoordinates, validateAreas, validateCountries, validateLevels, type ValidationContext } from "../core/validate";
import type { CanonicalArea, CanonicalCountry, CanonicalLevel } from "../core/model";

const L = { es: "x", en: "x", pt: "x", it: "x" };
const ctx: ValidationContext = { tzdbZones: new Set(["America/Argentina/Buenos_Aires"]), iso4217Codes: new Set(["ARS", "USD"]), iso3166_2Codes: new Set(["AR-C", "AR-B"]) };
const levels: CanonicalLevel[] = [
  { countryCode: "AR", rank: 1, kind: "ADMIN", labels: L, isRequired: true, reviewStatus: "PENDING", status: "PROVISIONAL" },
  { countryCode: "AR", rank: 2, kind: "ADMIN", labels: L, isRequired: false, reviewStatus: "PENDING", status: "PROVISIONAL" },
  { countryCode: "AR", rank: 3, kind: "LOCALITY", labels: L, isRequired: false, reviewStatus: "PENDING", status: "PROVISIONAL" },
];
const area = (o: Partial<CanonicalArea> & { sourceId: string }): CanonicalArea => ({
  countryCode: "AR", rank: 1, kind: "ADMIN", parent: null, isoCode: null, source: "T", name: o.sourceId, nameNormalized: normalizeName(o.name ?? o.sourceId),
  latitude: null, longitude: null, isActive: true, disposition: "OK", ...o,
});
const codes = (f: { code: string }[]) => f.map((x) => x.code);
const country = (o: Partial<CanonicalCountry>): CanonicalCountry => ({
  code: "AR", iso3: "ARG", isoNumeric: "032", names: { es: "Argentina", en: "Argentina", pt: "Argentina", it: "Argentina" }, locales: ["es", "en", "pt", "it"],
  currencyCode: "ARS", phonePrefix: "+54", timezones: ["America/Argentina/Buenos_Aires"], reviewStatus: "PENDING", isPriority: true, disposition: "OK", notes: [], evidence: {}, ...o,
});

describe("normalizeName", () => {
  it("quita diacríticos y pasa a minúsculas", () => assert.equal(normalizeName("Córdoba"), "cordoba"));
  it("colapsa y recorta espacios (incluido el no separable)", () => assert.equal(normalizeName(" San    José "), "san jose"));
  it("unifica apóstrofos, comillas y guiones tipográficos", () => assert.equal(normalizeName("O’Higgins – «Norte»"), `o'higgins - "norte"`));
  it("es determinista e idempotente", () => {
    for (const s of ["Ñuñoa", "São Paulo", "Città del Vaticano", "Mérida"]) {
      assert.equal(normalizeName(s), normalizeName(s));
      assert.equal(normalizeName(normalizeName(s)), normalizeName(s));
    }
  });
  it("no modifica el original", () => { const s = "Córdoba"; normalizeName(s); assert.equal(s, "Córdoba"); });
  it("trata igual la forma precompuesta y la descompuesta", () => assert.equal(normalizeName("José"), normalizeName("José")));
});

describe("validación ISO de países", () => {
  it("acepta un país válido", () => assert.deepEqual(validateCountries([country({})], ctx), []));
  it("rechaza ISO-2/ISO-3 inválidos, duplicados y nombres faltantes", () => {
    const f = codes(validateCountries([country({ code: "ar", iso3: "AR" }), country({ code: "AR" }), country({ code: "AR", names: { es: "", en: "A", pt: "A", it: "A" } })], ctx));
    for (const c of ["COUNTRY_ISO2_INVALID", "COUNTRY_ISO3_INVALID", "COUNTRY_DUPLICATE", "COUNTRY_ISO3_DUPLICATE", "COUNTRY_NAME_MISSING"]) assert.ok(f.includes(c), c);
  });
  it("rechaza moneda desconocida, prefijo inválido y zona inexistente en la tzdb", () => {
    const f = codes(validateCountries([country({ currencyCode: "XXX", phonePrefix: "54", timezones: ["Zona/Inventada"] })], ctx));
    for (const c of ["COUNTRY_CURRENCY_UNKNOWN", "COUNTRY_PHONE_INVALID", "COUNTRY_TZ_INVALID"]) assert.ok(f.includes(c), c);
  });
  it("no permite VERIFIED incompleto ni locales distintos a es/en/pt/it", () => {
    const f = codes(validateCountries([country({ reviewStatus: "VERIFIED", currencyCode: null, locales: ["es", "gn"] as never })], ctx));
    assert.ok(f.includes("COUNTRY_VERIFIED_INCOMPLETE") && f.includes("COUNTRY_LOCALES_INVALID"));
  });
});

describe("niveles (rank)", () => {
  it("acepta 1..N con ADMIN antes que LOCALITY", () => assert.deepEqual(validateLevels(levels, new Set(["AR"])), []));
  it("detecta rango repetido, no consecutivo, ADMIN después de LOCALITY y país inexistente", () => {
    const bad: CanonicalLevel[] = [
      { ...levels[0], countryCode: "ZZ" },
      { ...levels[0], rank: 1 }, { ...levels[0], rank: 1 },
      { ...levels[2], rank: 2 }, { ...levels[1], rank: 4 },
    ];
    const f = codes(validateLevels(bad, new Set(["AR"])));
    for (const c of ["LEVEL_COUNTRY_MISSING", "LEVEL_RANK_DUPLICATE", "LEVEL_RANK_NOT_CONTIGUOUS", "LEVEL_ORDER_INVALID"]) assert.ok(f.includes(c), c);
  });
});

describe("áreas: padres, rangos, ciclos, duplicados, ISO y coordenadas", () => {
  const P = area({ sourceId: "p", isoCode: "AR-C" });
  const D = area({ sourceId: "d", rank: 2, parent: { source: "T", sourceId: "p" } });
  const LOC = area({ sourceId: "l", rank: 3, kind: "LOCALITY", parent: { source: "T", sourceId: "d" } });
  const ok = validateAreas([P, D, LOC], levels, new Set(["AR"]), ctx);
  it("acepta una jerarquía válida", () => assert.deepEqual(ok, []));
  it("padre inexistente, de otro país y de rango no menor", () => {
    const f = codes(validateAreas([P, area({ sourceId: "x", rank: 2, parent: { source: "T", sourceId: "nada" } }), area({ sourceId: "y", rank: 2, countryCode: "UY", parent: { source: "T", sourceId: "p" } }), area({ sourceId: "z", rank: 2, parent: { source: "T", sourceId: "d" } }), D], levels, new Set(["AR", "UY"]), ctx));
    for (const c of ["AREA_PARENT_MISSING", "AREA_PARENT_COUNTRY", "AREA_PARENT_RANK"]) assert.ok(f.includes(c), c);
  });
  it("raíz que no es de rango 1 y ADMIN bajo LOCALITY", () => {
    const f = codes(validateAreas([P, D, LOC, area({ sourceId: "r", rank: 2 }), area({ sourceId: "a", rank: 2, parent: { source: "T", sourceId: "l" } })], levels, new Set(["AR"]), ctx));
    assert.ok(f.includes("AREA_ROOT_RANK") && f.includes("AREA_ADMIN_UNDER_LOCALITY"));
  });
  it("detecta ciclos", () => {
    const f = codes(validateAreas([area({ sourceId: "a", rank: 2, parent: { source: "T", sourceId: "b" } }), area({ sourceId: "b", rank: 2, parent: { source: "T", sourceId: "a" } })], levels, new Set(["AR"]), ctx));
    assert.ok(f.includes("AREA_CYCLE"));
  });
  it("source+sourceId e isoCode duplicados; homónimos como advertencia", () => {
    const f = validateAreas([P, area({ sourceId: "p" }), area({ sourceId: "q", isoCode: "AR-C" }), D, area({ sourceId: "d2", name: "d", rank: 2, parent: { source: "T", sourceId: "p" } })], levels, new Set(["AR"]), ctx);
    assert.ok(codes(f).includes("AREA_DUPLICATE_SOURCE_ID") && codes(f).includes("AREA_ISO_DUPLICATE"));
    assert.equal(f.find((x) => x.code === "AREA_HOMONYM")?.severity, "WARNING");
  });
  it("isoCode de otro país o fuera de ISO 3166-2", () => {
    const f = codes(validateAreas([area({ sourceId: "a", isoCode: "UY-MO" }), area({ sourceId: "b", isoCode: "AR-Q" })], levels, new Set(["AR"]), ctx));
    assert.ok(f.includes("AREA_ISO_COUNTRY") && f.includes("AREA_ISO_UNKNOWN"));
  });
  it("coordenadas", () => {
    assert.ok(validCoordinates(null, null) && validCoordinates(-34.6, -58.4));
    assert.ok(!validCoordinates(95, 10) && !validCoordinates(-34.6, null) && !validCoordinates(0, 181) && !validCoordinates(Number.NaN, 1));
    assert.ok(codes(validateAreas([area({ sourceId: "c", latitude: 95, longitude: 0 })], levels, new Set(["AR"]), ctx)).includes("AREA_COORDINATES_INVALID"));
  });
  it("nameNormalized vacío o desincronizado", () => {
    const f = codes(validateAreas([area({ sourceId: "n", name: "Córdoba", nameNormalized: "Cordoba" }), area({ sourceId: "m", nameNormalized: "" })], levels, new Set(["AR"]), ctx));
    assert.ok(f.includes("AREA_NAME_NORMALIZED_MISMATCH") && f.includes("AREA_NAME_NORMALIZED_EMPTY"));
  });
});
