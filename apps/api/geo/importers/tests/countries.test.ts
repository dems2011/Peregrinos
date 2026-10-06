import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildCatalog, isRuntimeZone } from "../build/catalog";
import { decideCurrency } from "../build/countries";
import { CONFIG_DIR, DOWNLOADS_DIR } from "../core/files";
import { loadIso4217 } from "../sources/iso4217";
import { parsePhoneTerritories } from "../sources/libphonenumber";

const hasDownloads = fs.existsSync(path.join(DOWNLOADS_DIR, "S5-libphonenumber__PhoneNumberMetadata.xml"));

describe("monedas: regla de decisión", () => {
  it("una sola moneda coincidente en ISO 4217 y CLDR → se determina", () => assert.deepEqual(decideCurrency(["ARS"], ["ARS"]), { code: "ARS", conflict: false }));
  it("SV (SVC/USD vs USD) → conflicto", () => assert.deepEqual(decideCurrency(["SVC", "USD"], ["USD"]), { code: null, conflict: true }));
  it("VE (VED/VES vs VES) → conflicto", () => assert.deepEqual(decideCurrency(["VED", "VES"], ["VES"]), { code: null, conflict: true }));
  it("PA (PAB/USD en ambas) → conflicto", () => assert.deepEqual(decideCurrency(["PAB", "USD"], ["PAB", "USD"]), { code: null, conflict: true }));
});

describe("monedas: decisiones aprobadas (sintético)", () => {
  it("una decisión fuera de ISO 4217 para el país es ERROR y no se aplica", async () => {
    const { buildCountries } = await import("../build/countries");
    const L = new Map([["XX", "X"]]);
    const { countries, findings } = buildCountries({
      iso3166_1: [{ alpha2: "XX", alpha3: "XXX", numeric: "999", name: "X" }], names: { es: L, en: L, pt: L, it: L },
      codeMappings: new Map([["XX", { alpha3: "XXX", numeric: "999" }]]), cldrTender: new Map([["XX", ["AAA", "BBB"]]]),
      iso4217: { published: null, entries: [{ countryName: "X", code: "AAA", isFund: false }, { countryName: "X", code: "BBB", isFund: false }], codes: new Set(["AAA", "BBB"]) },
      iso4217Names: { XX: "X" }, zonesByCountry: new Map([["XX", ["Europe/Rome"]]]), phoneTerritories: new Map([["XX", { id: "XX", countryCode: "99", mainCountryForCode: true }]]),
      priority: ["XX"], itu: { contrast: { XX: "CONFIRMED" }, operationalOverrides: {} }, isRuntimeZone: () => true,
      currencyDecisions: { XX: { currencyCode: "ZZZ", basis: "test" } },
    });
    assert.equal(countries[0].currencyCode, null);
    assert.equal(countries[0].reviewStatus, "PENDING");
    assert.ok(findings.some((f) => f.code === "CURRENCY_DECISION_INVALID" && f.severity === "ERROR"));
  });
});

describe("teléfonos: territorios no geográficos", () => {
  const xml = `<territories><territory id="001" countryCode="800"></territory><territory id="XK" countryCode="383"></territory>
    <territory id="AR" countryCode="54"></territory><territory id="VA" countryCode="39"></territory><territory id="IT" countryCode="39" mainCountryForCode="true"></territory></territories>`;
  const { territories, discarded } = parsePhoneTerritories(xml, new Set(["AR", "VA", "IT"]));
  it("001 y códigos fuera de ISO 3166-1 no se convierten en países", () => {
    assert.ok(!territories.has("001") && !territories.has("XK"));
    assert.deepEqual(discarded.sort(), ["001(+800)", "XK(+383)"]);
  });
  it("mantiene los territorios ISO", () => assert.equal(territories.get("AR")?.countryCode, "54"));
});

describe("zonas horarias en el entorno", () => {
  it("acepta alias IANA válidos aunque no sean canónicos en CLDR", () => assert.ok(isRuntimeZone("America/Argentina/Buenos_Aires")));
  it("rechaza zonas inexistentes", () => assert.ok(!isRuntimeZone("Zona/Inventada")));
});

describe("catálogo completo desde archivos reales verificados", { skip: !hasDownloads && "faltan descargas locales" }, () => {
  const cat = buildCatalog();
  const c = (code: string) => cat.countries.find((x) => x.code === code)!;
  it("249 países ISO 3166-1, 24 prioritarios, ninguno no geográfico", () => {
    assert.equal(cat.countries.length, 249);
    assert.equal(cat.countries.filter((x) => x.isPriority).length, 24);
    assert.ok(!cat.countries.some((x) => x.code === "001" || x.code === "XK"));
  });
  it("SV, VE y PA usan la decisión aprobada (USD, VES, PAB) y conservan la evidencia ISO/CLDR", () => {
    assert.equal(c("SV").currencyCode, "USD");
    assert.equal(c("VE").currencyCode, "VES");
    assert.equal(c("PA").currencyCode, "PAB");
    for (const code of ["SV", "VE", "PA"]) {
      assert.equal(c(code).disposition, "OK", code);
      assert.ok(c(code).evidence.currency?.decision, code);
    }
    assert.deepEqual(c("SV").evidence.currency?.iso4217, ["SVC", "USD"]);
    assert.equal(c("AR").currencyCode, "ARS");
    assert.equal(c("AR").evidence.currency?.decision, undefined);
  });
  it("VA usa +39 como valor del catálogo y documenta +379 como asignación UIT adicional", () => {
    assert.equal(c("VA").phonePrefix, "+39");
    assert.match(c("VA").evidence.phone?.note ?? "", /\+379/);
    assert.match(c("VA").evidence.phone?.note ?? "", /asignación adicional/);
    assert.doesNotMatch(c("VA").evidence.phone?.note ?? "", /no se usa en la práctica/);
  });
  it("los 24 prioritarios tienen el prefijo confirmado contra la UIT", () => {
    for (const x of cat.countries.filter((y) => y.isPriority)) assert.equal(x.evidence.phone?.ituContrast, "CONFIRMED", x.code);
  });
  it("países con varias zonas conservan todas (sin zona artificial única)", () => {
    assert.equal(c("AR").timezones.length, 12);
    assert.ok(c("AR").timezones.includes("America/Argentina/Buenos_Aires"));
    assert.equal(c("US").timezones.length, 29);
    assert.equal(c("VA").timezones.join(), "Europe/Vatican");
  });
  it("locales son exactamente los de producto", () => assert.ok(cat.countries.every((x) => x.locales.join() === "es,en,pt,it")));
  it("con contraste UIT CONFIRMED, los 24 prioritarios completos quedan VERIFIED y ningún no prioritario", () => {
    assert.equal(cat.countries.filter((x) => x.isPriority && x.reviewStatus === "VERIFIED").length, 24);
    assert.equal(cat.countries.filter((x) => !x.isPriority && x.reviewStatus === "VERIFIED").length, 0);
  });
  it("el catálogo no tiene errores de validación", () => assert.deepEqual(cat.findings.filter((f) => f.severity === "ERROR"), []));
  it("los 24 nombres ISO 4217 configurados existen literalmente en List One", () => {
    const names = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "iso4217-country-names.json"), "utf8")).names as Record<string, string>;
    const list = loadIso4217();
    for (const [code, name] of Object.entries(names)) assert.ok(list.entries.some((e) => e.countryName === name), `${code}: ${name}`);
  });
});

describe("modo seguro (garantía estática)", () => {
  it("ningún archivo del importador usa Prisma, la config de la API, dotenv ni DATABASE_URL", () => {
    const root = path.resolve(__dirname, "..");
    const files: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) files.push(p); } };
    walk(root);
    assert.ok(files.length >= 10);
    const forbidden = [/@prisma\/client/, /src\/lib\/prisma/, /src\/config/, /from ["']dotenv/, /require\(["']dotenv/, /DATABASE_URL/, /PrismaClient/];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\*|\/\/)/.test(l)).join("\n"); // ignora comentarios
      for (const re of forbidden) assert.ok(!re.test(src), `${path.relative(root, f)} contiene ${re}`);
    }
  });
});
