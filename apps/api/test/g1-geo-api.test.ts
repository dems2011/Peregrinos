/**
 * G1 — API de solo lectura del catálogo geográfico (/api/geo/*).
 * Helpers puros probados en memoria (sin base de datos); rutas verificadas sobre el código fuente.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "@peregrinos/shared";
import {
  AREAS_DEFAULT_LIMIT, AREAS_MAX_LIMIT, BREADCRUMB_MAX_DEPTH, DEFAULT_GEO_LOCALE, GEO_CACHE_CONTROL, GEO_LOCALES, ancestorSelect,
  areaParamsSchema, areaQuerySchema, areasQuerySchema, buildBreadcrumb, countriesQuerySchema, countryParamsSchema, levelsQuerySchema,
  normalizeName, pickGeoLocale, resolveLabel, sortByLabel, withHasChildren,
} from "../src/lib/geo";
import { normalizeName as importerNormalize } from "../geo/importers/core/normalize";

const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const U1 = "11111111-1111-4111-8111-111111111111";

describe("resolveLabel", () => {
  const names = { es: "Argentina", en: "Argentina (en)", pt: "Argentina (pt)", it: "Argentina (it)" };
  it("usa el idioma pedido", () => {
    assert.equal(resolveLabel(names, "pt"), "Argentina (pt)");
    assert.equal(resolveLabel(names), "Argentina");
  });
  it("cae a es, luego en, luego cualquier valor", () => {
    assert.equal(resolveLabel({ es: "Provincia", en: "Province" }, "it"), "Provincia");
    assert.equal(resolveLabel({ en: "Province" }, "it"), "Province");
    assert.equal(resolveLabel({ fr: "Province" }, "es"), "Province");
    assert.equal(resolveLabel({ es: "  ", en: "State" }, "es"), "State");
  });
  it("devuelve null ante datos no válidos", () => {
    for (const v of [null, undefined, "x", 3, [], {}, { es: 5 }]) assert.equal(resolveLabel(v, "es"), null);
  });
});

describe("normalizeName", () => {
  it("coincide con la normalización del importador (nameNormalized)", () => {
    for (const s of ["Córdoba", "  San  José ", "Ñuñoa", "D’Annunzio", "Santa Fe—Norte", "São Paulo", "CABA Comuna 1", "«Río»"]) {
      assert.equal(normalizeName(s), importerNormalize(s), s);
    }
    assert.equal(normalizeName("CÓRDOBA"), "cordoba");
  });
});

describe("validación de entrada", () => {
  it("countries: locale opcional (se resuelve luego) y rechaza idiomas o parámetros desconocidos", () => {
    assert.deepEqual(countriesQuerySchema.parse({}), {});
    assert.equal(countriesQuerySchema.parse({ locale: "it" }).locale, "it");
    assert.throws(() => countriesQuerySchema.parse({ locale: "fr" }));
    assert.throws(() => countriesQuerySchema.parse({ foo: "1" }));
  });
  it("locale: acepta etiquetas BCP-47 de idiomas soportados y rechaza basura", () => {
    assert.equal(countriesQuerySchema.parse({ locale: "pt-BR" }).locale, "pt");
    assert.equal(levelsQuerySchema.parse({ locale: "EN_us" }).locale, "en");
    assert.equal(areaQuerySchema.parse({ locale: " it " }).locale, "it");
    for (const locale of ["fr-FR", "e", "es-", "es--AR", "x".repeat(40), "es;DROP", "<es>", ""]) {
      assert.throws(() => countriesQuerySchema.parse({ locale }), `locale=${JSON.stringify(locale)}`);
    }
  });
  it("código de país ISO-2, normalizado a mayúsculas", () => {
    assert.equal(countryParamsSchema.parse({ code: "ar" }).code, "AR");
    for (const code of ["ARG", "A", "1A", ""]) assert.throws(() => countryParamsSchema.parse({ code }));
  });
  it("areas: country obligatorio, limit por defecto y tope", () => {
    const d = areasQuerySchema.parse({ country: "ve" });
    assert.equal(d.country, "VE"); assert.equal(d.limit, AREAS_DEFAULT_LIMIT); assert.equal(d.parentId, undefined);
    assert.equal(areasQuerySchema.parse({ country: "AR", limit: "200" }).limit, AREAS_MAX_LIMIT);
    assert.throws(() => areasQuerySchema.parse({}));
    for (const limit of ["0", "201", "-1", "1.5", "abc"]) assert.throws(() => areasQuerySchema.parse({ country: "AR", limit }), `limit=${limit}`);
  });
  it("areas: parentId UUID, q de 2 a 80 caracteres, sin parámetros extra", () => {
    assert.equal(areasQuerySchema.parse({ country: "AR", parentId: U1 }).parentId, U1);
    assert.throws(() => areasQuerySchema.parse({ country: "AR", parentId: "1" }));
    assert.equal(areasQuerySchema.parse({ country: "AR", q: " sa " }).q, "sa");
    assert.throws(() => areasQuerySchema.parse({ country: "AR", q: "a" }));
    assert.throws(() => areasQuerySchema.parse({ country: "AR", q: "x".repeat(81) }));
    assert.throws(() => areasQuerySchema.parse({ country: "AR", source: "GEOREF" }));
  });
  it("areas: q sin comodines LIKE, sin control y con al menos 2 caracteres útiles tras normalizar", () => {
    for (const q of ["%%", "a%", "__", "s_n", "a\\b", "ab\u0000", "ab\ncd", "́́"]) {
      assert.throws(() => areasQuerySchema.parse({ country: "AR", q }), `q=${JSON.stringify(q)}`);
    }
    assert.equal(areasQuerySchema.parse({ country: "AR", q: "Ñu" }).q, "Ñu");
    assert.equal(areasQuerySchema.parse({ country: "AR", q: "D'Annunzio" }).q, "D'Annunzio");
  });
  it("areas: país y parentId rechazan inyección y tipos inesperados", () => {
    for (const country of ["A R", "AR'", "ÁR", ["AR"]]) assert.throws(() => areasQuerySchema.parse({ country }), JSON.stringify(country));
    for (const parentId of ["' OR 1=1 --", "11111111-1111-4111-8111-11111111111", "", ["x"]]) {
      assert.throws(() => areasQuerySchema.parse({ country: "AR", parentId }), JSON.stringify(parentId));
    }
    assert.throws(() => areasQuerySchema.parse({ country: "AR", limit: "1e9" }));
  });
  it("area por id: UUID y solo locale en la query", () => {
    assert.equal(areaParamsSchema.parse({ id: U1 }).id, U1);
    assert.throws(() => areaParamsSchema.parse({ id: "abc" }));
    assert.throws(() => areaQuerySchema.parse({ depth: "100" }));
  });
});

describe("idioma efectivo", () => {
  it("los idiomas del catálogo son los de la app (shared SUPPORTED_LOCALES)", () => {
    assert.deepEqual([...GEO_LOCALES], [...SUPPORTED_LOCALES]);
    assert.equal(DEFAULT_GEO_LOCALE, "es");
  });
  it("?locale= gana; si falta, Accept-Language con q; si nada sirve, es", () => {
    assert.equal(pickGeoLocale("it", "pt-BR,pt;q=0.9"), "it");
    assert.equal(pickGeoLocale(undefined, "fr-FR,pt;q=0.8,en;q=0.9"), "en");
    assert.equal(pickGeoLocale(undefined, "pt-BR"), "pt");
    assert.equal(pickGeoLocale(undefined, ["de", "it"]), "it");
    assert.equal(pickGeoLocale(undefined, "fr,de"), "es");
    assert.equal(pickGeoLocale(undefined, undefined), "es");
    assert.equal(pickGeoLocale(undefined, "x".repeat(10_000) + ",en"), "es"); // se recorta: nunca procesa cabeceras enormes
  });
});

describe("hasChildren", () => {
  it("marca solo las áreas con hijos activos según el groupBy", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const out = withHasChildren(rows, [{ parentId: "a", _count: { _all: 3 } }, { parentId: "c", _count: { _all: 0 } }, { parentId: null, _count: { _all: 9 } }]);
    assert.deepEqual(out.map((r) => r.hasChildren), [true, false, false]);
  });
});

describe("breadcrumb", () => {
  const chain = (n: number) => {
    let node: any = null;
    for (let i = 1; i <= n; i++) node = { id: `a${i}`, name: `Área ${i}`, kind: "ADMIN", rank: i, isoCode: null, isActive: true, parent: node };
    return node;
  };
  it("ruta raíz → padre, sin el propio nodo", () => {
    const leaf = { id: "x", parent: chain(3) };
    const { path: p, truncated } = buildBreadcrumb(leaf);
    assert.deepEqual(p.map((c) => c.id), ["a1", "a2", "a3"]);
    assert.equal(truncated, false);
    assert.equal(Object.hasOwn(p[0], "parent") || Object.hasOwn(p[0], "isActive"), false);
  });
  it("tope de profundidad", () => {
    const { path: p, truncated } = buildBreadcrumb({ parent: chain(BREADCRUMB_MAX_DEPTH + 3) });
    assert.equal(p.length, BREADCRUMB_MAX_DEPTH);
    assert.equal(truncated, true);
    assert.equal(buildBreadcrumb({ parent: chain(BREADCRUMB_MAX_DEPTH) }).truncated, false);
  });
  it("se protege de ciclos", () => {
    const a: any = { id: "a", name: "A", kind: "ADMIN", rank: 1, isoCode: null };
    const b: any = { id: "b", name: "B", kind: "ADMIN", rank: 2, isoCode: null, parent: a };
    a.parent = b;
    const r = buildBreadcrumb({ parent: b });
    assert.equal(r.path.length, 2); assert.equal(r.truncated, true);
  });
  it("el select anidado tiene profundidad fija y no expone metadatos de importación", () => {
    let depth = 0; let s: any = ancestorSelect();
    while (s.parent) { depth++; assert.equal("source" in s || "sourceId" in s || "nameNormalized" in s, false); s = s.parent.select; }
    assert.equal(depth, BREADCRUMB_MAX_DEPTH);
  });
});

describe("orden de países", () => {
  it("por nombre localizado y luego por código", () => {
    const rows = [{ code: "PE", name: "Perú" }, { code: "AR", name: "Argentina" }, { code: "ZZ", name: "Paraguay" }, { code: "PY", name: "Paraguay" }];
    assert.deepEqual(sortByLabel(rows, "es").map((r) => r.code), ["AR", "PY", "ZZ", "PE"]);
  });
});

describe("rutas /api/geo (estructura)", () => {
  const src = stripComments(read("src/routes/geo.ts"));
  const routes = [...src.matchAll(/app\.(get|head|post|put|patch|delete|options|all|route)\(\s*"([^"]+)"\s*,\s*([^,]+),/g)];
  it("expone exactamente los cuatro GET previstos", () => {
    assert.deepEqual(routes.map((r) => `${r[1]} ${r[2]}`).sort(), ["get /areas", "get /areas/:id", "get /countries", "get /countries/:code/levels"]);
  });
  it("sin métodos de escritura ni escrituras en la base", () => {
    assert.doesNotMatch(src, /app\.(post|put|patch|delete|route)\(/);
    assert.doesNotMatch(src, /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$queryRaw/);
  });
  it("cada ruta declara rateLimit", () => {
    assert.match(src, /const rl = \(max: number\) => \(\{ config: \{ rateLimit: \{ max, timeWindow: "1 minute" \} \} \}\)/);
    for (const r of routes) assert.match(r[3], /^rl\(\d+\)$/, `${r[2]} sin rateLimit`);
  });
  it("es pública (sin preHandler de sesión) y no devuelve metadatos de importación", () => {
    assert.doesNotMatch(src, /preHandler|requirePermission|requireAuth/);
    assert.doesNotMatch(src, /\b(sourceId|source|nameNormalized|reviewStatus|createdAt|updatedAt)\s*:\s*true/);
  });
  it("filtra filas activas/habilitadas", () => {
    assert.match(src, /isEnabled: true/);
    assert.match(src, /isActive: true/);
  });
  it("toda consulta de áreas exige isActive y toda consulta de país isEnabled", () => {
    for (const m of src.matchAll(/prisma\.administrativeArea\.(findMany|findFirst|count|groupBy)\(([\s\S]*?)\)\s*[,;\]]/g)) {
      assert.match(m[2], /isActive: true/, `administrativeArea.${m[1]} sin isActive`);
    }
    for (const m of src.matchAll(/prisma\.country\.(findMany|findFirst)\(([\s\S]*?)\)\s*[,;]/g)) {
      assert.match(m[2], /isEnabled: true/, `country.${m[1]} sin isEnabled`);
    }
    // El detalle de área solo existe si su país está habilitado; la lista de hijos valida el país antes de responder.
    assert.match(src, /country: \{ isEnabled: true \}/);
    assert.match(src, /enabledCountry\(country\)/);
  });
  it("toda consulta lleva tope (take) o es por clave/agregado", () => {
    for (const m of src.matchAll(/\.findMany\(\{([\s\S]*?)\n\s{4,6}\}\)/g)) assert.match(m[1], /take:/, "findMany sin take");
  });
  it("idioma por pickGeoLocale (query → Accept-Language) en las rutas con textos localizados", () => {
    assert.equal((src.match(/localeOf\(req, /g) ?? []).length, 3);
    assert.match(src, /pickGeoLocale\(queryLocale, req\.headers\["accept-language"\]\)/);
  });
  it("caché pública solo en 200 sin cookies, con Vary: Accept-Language", () => {
    assert.match(src, /addHook\("onSend"/);
    assert.match(src, /reply\.statusCode === 200 && !reply\.hasHeader\("set-cookie"\)/);
    assert.match(src, /"Vary", "Accept-Language"/);
    assert.match(GEO_CACHE_CONTROL, /^public, max-age=\d+/);
    assert.doesNotMatch(GEO_CACHE_CONTROL, /private|no-store/);
  });
  it("está registrada bajo /api/geo", () => {
    assert.match(read("src/app.ts"), /register\(geoRoutes, \{ prefix: "\/api\/geo" \}\)/);
  });
});

describe("AreaPicker (web, estructura)", () => {
  const file = path.join(repo, "apps/web/src/components/AreaPicker.tsx");
  const src = stripComments(fs.readFileSync(file, "utf8"));
  it("toda petición al API pasa una señal de aborto", () => {
    const calls = [...src.matchAll(/api<[\s\S]*?>\(([\s\S]*?)\)\s*[\n.;,)]/g)];
    assert.ok(calls.length >= 3);
    for (const c of calls) assert.match(c[1], /signal/, `petición sin signal: ${c[1].slice(0, 60)}`);
    assert.match(src, /new AbortController\(\)/);
    assert.match(src, /isAbort\(e\)/);
  });
  it("solo consulta endpoints de /geo y nunca escribe", () => {
    for (const m of src.matchAll(/`(\/[^`$]*)/g)) assert.match(m[1], /^\/geo\//);
    assert.doesNotMatch(src, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
  });
  it("textos de interfaz en todos los idiomas soportados, con las mismas claves", () => {
    const ui = src.match(/const UI: [\s\S]*?\n\};/)?.[0] ?? "";
    const blocks = Object.fromEntries([...ui.matchAll(/\n  (\w+): \{([\s\S]*?)\n  \},/g)].map((m) => [m[1], m[2]]));
    assert.deepEqual(Object.keys(blocks).sort(), [...SUPPORTED_LOCALES].sort());
    const keys = (b: string) => [...b.matchAll(/(?:^|,)\s*(\w+):/gm)].map((m) => m[1]).sort();
    for (const l of SUPPORTED_LOCALES) assert.deepEqual(keys(blocks[l]), keys(blocks.es), `claves de ${l}`);
  });
  it("accesibilidad: etiquetas asociadas, estado anunciado y error con role=alert", () => {
    assert.match(src, /role="alert"/);
    assert.match(src, /role="status" aria-live="polite"/);
    assert.match(src, /aria-busy=/);
    const ids = [...src.matchAll(/<select\s+id=\{(`[^`]*`|\w+)\}/g)].map((m) => m[1]);
    assert.ok(ids.length >= 2);
    for (const id of ids) assert.ok(src.includes(`htmlFor={${id}}`), `select ${id} sin label`);
  });
  it("siempre ofrece texto libre acotado", () => {
    assert.match(src, /MISSING/);
    assert.match(src, /maxLength=\{FREE_TEXT_MAX\}/);
  });
});
