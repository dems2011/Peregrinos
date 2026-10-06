/**
 * Validación GENERAL del catálogo canónico (no conoce ninguna fuente concreta).
 * Replica en memoria las reglas que PostgreSQL impone con FK/CHECK en G1-schema, más las que
 * quedaron a cargo del importador (configuración de niveles, formatos ISO/IANA/BCP-47, duplicados).
 */
import { PRODUCT_LOCALES, areaKey, type CanonicalArea, type CanonicalCountry, type CanonicalLevel, type Finding } from "./model";
import { normalizeName } from "./normalize";

export const RE_ISO2 = /^[A-Z]{2}$/;
export const RE_ISO3 = /^[A-Z]{3}$/;
export const RE_ISO_NUMERIC = /^[0-9]{3}$/;
export const RE_CURRENCY = /^[A-Z]{3}$/;
export const RE_PHONE_PREFIX = /^\+[1-9][0-9]{0,3}$/;
export const RE_ISO3166_2 = /^([A-Z]{2})-[A-Z0-9]{1,3}$/;

const err = (code: string, message: string, ref?: string): Finding => ({ severity: "ERROR", code, message, ref });
const warn = (code: string, message: string, ref?: string): Finding => ({ severity: "WARNING", code, message, ref });

export function validCoordinates(lat: number | null, lng: number | null): boolean {
  if (lat === null && lng === null) return true;
  if (lat === null || lng === null) return false;
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export interface ValidationContext {
  /** Zonas válidas según la tzdb usada (fuente de verdad). */
  tzdbZones: Set<string>;
  /** Códigos ISO 4217 vigentes (List One). */
  iso4217Codes: Set<string>;
  /** Códigos ISO 3166-2 conocidos (para validar isoCode). */
  iso3166_2Codes: Set<string>;
}

export function validateCountries(countries: CanonicalCountry[], ctx: ValidationContext): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>(), seen3 = new Set<string>(), seenNum = new Set<string>();
  for (const c of countries) {
    const ref = `Country ${c.code}`;
    if (!RE_ISO2.test(c.code)) out.push(err("COUNTRY_ISO2_INVALID", `ISO-2 inválido: ${c.code}`, ref));
    if (seen.has(c.code)) out.push(err("COUNTRY_DUPLICATE", `País duplicado: ${c.code}`, ref));
    seen.add(c.code);
    if (c.iso3 !== null) {
      if (!RE_ISO3.test(c.iso3)) out.push(err("COUNTRY_ISO3_INVALID", `ISO-3 inválido: ${c.iso3}`, ref));
      if (seen3.has(c.iso3)) out.push(err("COUNTRY_ISO3_DUPLICATE", `ISO-3 duplicado: ${c.iso3}`, ref));
      seen3.add(c.iso3);
    }
    if (c.isoNumeric !== null) {
      if (!RE_ISO_NUMERIC.test(c.isoNumeric)) out.push(err("COUNTRY_NUMERIC_INVALID", `ISO numérico inválido: ${c.isoNumeric}`, ref));
      if (seenNum.has(c.isoNumeric)) out.push(err("COUNTRY_NUMERIC_DUPLICATE", `ISO numérico duplicado: ${c.isoNumeric}`, ref));
      seenNum.add(c.isoNumeric);
    }
    for (const l of PRODUCT_LOCALES) if (!c.names[l]?.trim()) out.push(err("COUNTRY_NAME_MISSING", `Falta nombre en ${l}`, ref));
    if (c.locales.join(",") !== PRODUCT_LOCALES.join(",")) out.push(err("COUNTRY_LOCALES_INVALID", `locales debe ser exactamente ${PRODUCT_LOCALES.join(",")}`, ref));
    if (c.currencyCode !== null) {
      if (!RE_CURRENCY.test(c.currencyCode)) out.push(err("COUNTRY_CURRENCY_FORMAT", `Moneda con formato inválido: ${c.currencyCode}`, ref));
      else if (!ctx.iso4217Codes.has(c.currencyCode)) out.push(err("COUNTRY_CURRENCY_UNKNOWN", `Moneda no presente en ISO 4217 List One: ${c.currencyCode}`, ref));
    }
    if (c.phonePrefix !== null && !RE_PHONE_PREFIX.test(c.phonePrefix)) out.push(err("COUNTRY_PHONE_INVALID", `Prefijo inválido: ${c.phonePrefix}`, ref));
    if (new Set(c.timezones).size !== c.timezones.length) out.push(err("COUNTRY_TZ_DUPLICATE", "Zonas horarias repetidas", ref));
    for (const z of c.timezones) if (!ctx.tzdbZones.has(z)) out.push(err("COUNTRY_TZ_INVALID", `Zona no presente en la tzdb: ${z}`, ref));
    if (c.reviewStatus === "VERIFIED" && (c.currencyCode === null || c.phonePrefix === null || c.timezones.length === 0)) {
      out.push(err("COUNTRY_VERIFIED_INCOMPLETE", "VERIFIED con perfil incompleto", ref));
    }
    if (c.reviewStatus === "VERIFIED" && c.disposition !== "OK") out.push(err("COUNTRY_VERIFIED_WITH_REVIEW", "VERIFIED con revisión pendiente", ref));
  }
  return out;
}

export function validateLevels(levels: CanonicalLevel[], countryCodes: Set<string>): Finding[] {
  const out: Finding[] = [];
  const byCountry = new Map<string, CanonicalLevel[]>();
  for (const l of levels) {
    const ref = `Level ${l.countryCode}#${l.rank}`;
    if (!countryCodes.has(l.countryCode)) out.push(err("LEVEL_COUNTRY_MISSING", `País inexistente: ${l.countryCode}`, ref));
    if (!Number.isInteger(l.rank) || l.rank < 1) out.push(err("LEVEL_RANK_INVALID", `rank inválido: ${l.rank}`, ref));
    if (l.kind !== "ADMIN" && l.kind !== "LOCALITY") out.push(err("LEVEL_KIND_INVALID", `kind inválido: ${l.kind}`, ref));
    for (const loc of PRODUCT_LOCALES) if (!l.labels?.[loc]?.trim()) out.push(err("LEVEL_LABEL_MISSING", `Falta etiqueta en ${loc}`, ref));
    if (l.reviewStatus === "VERIFIED" && l.status === "PROVISIONAL") out.push(err("LEVEL_PROVISIONAL_VERIFIED", "Un nivel provisional no puede ser VERIFIED", ref));
    byCountry.set(l.countryCode, [...(byCountry.get(l.countryCode) ?? []), l]);
  }
  for (const [cc, ls] of byCountry) {
    const ranks = ls.map((l) => l.rank).sort((a, b) => a - b);
    if (new Set(ranks).size !== ranks.length) out.push(err("LEVEL_RANK_DUPLICATE", `rank repetido en ${cc}`, cc));
    if (ranks.some((r, i) => r !== i + 1)) out.push(err("LEVEL_RANK_NOT_CONTIGUOUS", `Los rangos de ${cc} deben ser 1..N consecutivos (${ranks.join(",")})`, cc));
    const maxAdmin = Math.max(0, ...ls.filter((l) => l.kind === "ADMIN").map((l) => l.rank));
    const minLocality = Math.min(Infinity, ...ls.filter((l) => l.kind === "LOCALITY").map((l) => l.rank));
    if (maxAdmin > minLocality) out.push(err("LEVEL_ORDER_INVALID", `En ${cc} un ADMIN tiene rango mayor que una LOCALITY`, cc));
  }
  return out;
}

export function validateAreas(areas: CanonicalArea[], levels: CanonicalLevel[], countryCodes: Set<string>, ctx: ValidationContext): Finding[] {
  const out: Finding[] = [];
  const byKey = new Map<string, CanonicalArea>();
  for (const a of areas) {
    const k = areaKey(a);
    if (byKey.has(k)) out.push(err("AREA_DUPLICATE_SOURCE_ID", `source+sourceId duplicado: ${k}`, k));
    byKey.set(k, a);
  }
  const levelOf = (cc: string, rank: number) => levels.find((l) => l.countryCode === cc && l.rank === rank);
  const isoSeen = new Map<string, string>();
  for (const a of areas) {
    const ref = areaKey(a);
    if (!countryCodes.has(a.countryCode)) out.push(err("AREA_COUNTRY_MISSING", `País inexistente: ${a.countryCode}`, ref));
    const level = levelOf(a.countryCode, a.rank);
    if (!level) out.push(err("AREA_LEVEL_MISSING", `No existe el nivel ${a.countryCode}#${a.rank}`, ref));
    else if (level.kind !== a.kind) out.push(err("AREA_KIND_MISMATCH", `kind ${a.kind} no coincide con el nivel (${level.kind})`, ref));
    if (!a.name.trim()) out.push(err("AREA_NAME_EMPTY", "Nombre vacío", ref));
    if (!a.nameNormalized) out.push(err("AREA_NAME_NORMALIZED_EMPTY", "nameNormalized vacío", ref));
    else if (a.nameNormalized !== normalizeName(a.name)) out.push(err("AREA_NAME_NORMALIZED_MISMATCH", "nameNormalized no corresponde a normalizeName(name)", ref));
    if (!a.source.trim() || !a.sourceId.trim()) out.push(err("AREA_SOURCE_EMPTY", "source/sourceId vacío", ref));
    if (!validCoordinates(a.latitude, a.longitude)) out.push(err("AREA_COORDINATES_INVALID", `Coordenadas inválidas (${a.latitude}, ${a.longitude})`, ref));
    if (a.isoCode !== null) {
      const m = RE_ISO3166_2.exec(a.isoCode);
      if (!m) out.push(err("AREA_ISO_FORMAT", `isoCode con formato inválido: ${a.isoCode}`, ref));
      else if (m[1] !== a.countryCode) out.push(err("AREA_ISO_COUNTRY", `isoCode ${a.isoCode} no corresponde a ${a.countryCode}`, ref));
      else if (!ctx.iso3166_2Codes.has(a.isoCode)) out.push(err("AREA_ISO_UNKNOWN", `isoCode no presente en ISO 3166-2: ${a.isoCode}`, ref));
      if (isoSeen.has(a.isoCode)) out.push(err("AREA_ISO_DUPLICATE", `isoCode duplicado: ${a.isoCode} (también ${isoSeen.get(a.isoCode)})`, ref));
      isoSeen.set(a.isoCode, ref);
    }
    if (a.parent === null) {
      if (a.rank !== 1) out.push(err("AREA_ROOT_RANK", `Un área sin padre debe ser de rango 1 (es ${a.rank})`, ref));
    } else {
      const p = byKey.get(areaKey(a.parent));
      if (!p) out.push(err("AREA_PARENT_MISSING", `Padre inexistente: ${areaKey(a.parent)}`, ref));
      else {
        if (p.countryCode !== a.countryCode) out.push(err("AREA_PARENT_COUNTRY", `Padre de otro país (${p.countryCode})`, ref));
        if (!(p.rank < a.rank)) out.push(err("AREA_PARENT_RANK", `Rango del padre (${p.rank}) no es menor que el del hijo (${a.rank})`, ref));
        if (p.kind === "LOCALITY" && a.kind === "ADMIN") out.push(err("AREA_ADMIN_UNDER_LOCALITY", "ADMIN debajo de LOCALITY", ref));
      }
    }
  }
  // Ciclos (la regla de rangos los hace imposibles; se verifican igual por defensa en profundidad).
  for (const a of areas) {
    const visited = new Set<string>([areaKey(a)]);
    let cur: CanonicalArea | undefined = a;
    while (cur?.parent) {
      const k = areaKey(cur.parent);
      if (visited.has(k)) { out.push(err("AREA_CYCLE", `Ciclo detectado desde ${areaKey(a)}`, areaKey(a))); break; }
      visited.add(k);
      cur = byKey.get(k);
    }
  }
  // Homónimos bajo el mismo padre (advertencia: pueden ser legítimos).
  const groups = new Map<string, string[]>();
  for (const a of areas) {
    const g = `${a.countryCode}|${a.parent ? areaKey(a.parent) : "ROOT"}|${a.kind}|${a.nameNormalized}`;
    groups.set(g, [...(groups.get(g) ?? []), areaKey(a)]);
  }
  for (const [g, keys] of groups) if (keys.length > 1) out.push(warn("AREA_HOMONYM", `Homónimos bajo el mismo padre: ${keys.join(", ")}`, g));
  return out;
}
