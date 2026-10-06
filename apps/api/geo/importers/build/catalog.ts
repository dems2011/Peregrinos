/**
 * Orquestador del catálogo canónico: lee las fuentes verificadas, construye países, niveles y áreas,
 * y valida todo con el validador general. Solo archivos locales: no importa Prisma ni lee DATABASE_URL.
 */
import path from "node:path";
import { CONFIG_DIR, GEO_DIR, loadManifest, readJsonFile } from "../core/files";
import type { CanonicalArea, CanonicalCountry, CanonicalLevel, ExcludedRecord, Finding } from "../core/model";
import { validateAreas, validateCountries, validateLevels, type ValidationContext } from "../core/validate";
import { loadCodeMappings, loadCurrentTender, loadTerritoryNames } from "../sources/cldr";
import { buildGeorefAreas, loadGeorefInput, type GeorefHold } from "../sources/georef";
import { loadIso3166_1, loadIso3166_2 } from "../sources/isoCodes";
import { loadIso4217 } from "../sources/iso4217";
import { loadPhoneTerritories } from "../sources/libphonenumber";
import { loadTzdb } from "../sources/tzdb";
import { buildCountries } from "./countries";
import { LEVEL_COUNTRIES, contrastLevels, loadLevelsFile, toCanonicalLevels, type LevelContrast } from "./levels";

export interface Catalog {
  countries: CanonicalCountry[];
  levels: CanonicalLevel[];
  areas: CanonicalArea[];
  excluded: ExcludedRecord[];
  findings: Finding[];
  levelContrasts: LevelContrast[];
  meta: {
    sources: Array<{ id: string; version?: string; sha256: string | null }>;
    iso4217Published: string | null;
    tzdbVersion: string;
    runtimeTz: string | undefined;
    phoneDiscarded: string[];
    skippedCountries: Array<{ code: string; reason: string }>;
    georefStats: Record<string, number>;
  };
}

/** Intl.supportedValuesOf solo lista IDs canónicos de CLDR; un alias IANA válido (p. ej. America/Argentina/Buenos_Aires) se comprueba usándolo. */
export function isRuntimeZone(zone: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
}

export function buildCatalog(): Catalog {
  const iso1 = loadIso3166_1();
  const iso2 = loadIso3166_2();
  const iso4217 = loadIso4217();
  const tz = loadTzdb();
  const phones = loadPhoneTerritories(new Set(iso1.map((c) => c.alpha2)));
  const priority = readJsonFile<{ countries: Array<{ code: string }> }>(path.join(GEO_DIR, "priority-countries.json")).countries.map((c) => c.code);
  const iso4217Names = readJsonFile<{ names: Record<string, string> }>(path.join(CONFIG_DIR, "iso4217-country-names.json")).names;
  const itu = readJsonFile<{ contrast: Record<string, string>; operationalOverrides: Record<string, { operationalPrefix: string; ituAssigned: string | string[]; decision: string }> }>(path.join(CONFIG_DIR, "itu-contrast.json"));
  const currencyDecisions = readJsonFile<{ decisions: Record<string, { currencyCode: string; basis: string }> }>(path.join(CONFIG_DIR, "currency-decisions.json")).decisions;

  const { countries, findings: countryFindings } = buildCountries({
    iso3166_1: iso1, names: loadTerritoryNames(), codeMappings: loadCodeMappings(), cldrTender: loadCurrentTender(),
    iso4217, iso4217Names, zonesByCountry: tz.zonesByCountry, phoneTerritories: phones.territories, priority, itu,
    isRuntimeZone, currencyDecisions,
  });

  // Áreas: en esta fase solo AR (Georef). VE: solo niveles (D2); sus áreas esperan una fuente aprobada (D4).
  const levelFiles = LEVEL_COUNTRIES.map(loadLevelsFile);
  const levels = levelFiles.flatMap(toCanonicalLevels);
  const georefReview = readJsonFile<{ review: Record<string, GeorefHold> }>(path.join(CONFIG_DIR, "georef-review.json")).review;
  const georef = buildGeorefAreas(loadGeorefInput(), georefReview);

  const levelContrasts = levelFiles.flatMap((lf) => contrastLevels(lf, { areas: georef.areas, iso3166_2: iso2 }));
  const contrastFindings: Finding[] = levelContrasts
    .filter((c) => c.status !== "MATCH")
    .map((c) => ({
      severity: c.status === "MISMATCH" ? "ERROR" : "INFO",
      code: c.status === "MISMATCH" ? "LEVEL_CONTRAST_MISMATCH" : "LEVEL_CONTRAST_PENDING_SOURCE",
      message: `${c.source}: esperado ${c.expected ?? "—"}, observado ${c.observed ?? "—"} · ${c.detail}`,
      ref: `Level ${c.countryCode}#${c.rank}`,
    }));
  const ctx: ValidationContext = { tzdbZones: tz.allZones, iso4217Codes: iso4217.codes, iso3166_2Codes: new Set(iso2.map((s) => s.code)) };
  const codes = new Set(countries.map((c) => c.code));
  const findings = [
    ...countryFindings,
    ...georef.findings,
    ...contrastFindings,
    ...validateCountries(countries, ctx),
    ...validateLevels(levels, codes),
    ...validateAreas(georef.areas, levels, codes, ctx),
  ];

  return {
    countries, levels, areas: georef.areas, excluded: georef.excluded, findings, levelContrasts,
    meta: {
      sources: loadManifest().datasets.filter((d) => d.sha256).map((d) => ({ id: d.id, version: d.version, sha256: d.sha256 })),
      iso4217Published: iso4217.published, tzdbVersion: tz.version, runtimeTz: process.versions.tz,
      phoneDiscarded: phones.discarded,
      skippedCountries: [{ code: "VE", reason: "Áreas no generadas: la fuente (COD-AB / INE) todavía no está aprobada. Solo niveles (D2)." }],
      georefStats: georef.stats,
    },
  };
}
