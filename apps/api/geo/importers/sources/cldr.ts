/** Adaptador: Unicode CLDR 48.2.1 (nombres de territorios, monedas vigentes, mapeos de códigos). */
import { readVerifiedJson } from "../core/files";
import { PRODUCT_LOCALES, type ProductLocale } from "../core/model";

type TerritoriesJson = { main: Record<string, { localeDisplayNames: { territories: Record<string, string> } }> };

/** Nombres por territorio alfa-2. Ignora las variantes "-alt-short" / "-alt-variant" (decisión: se usa el nombre principal). */
export function parseTerritoryNames(json: TerritoriesJson, locale: string): Map<string, string> {
  const t = json.main[locale].localeDisplayNames.territories;
  return new Map(Object.entries(t).filter(([k]) => /^[A-Z]{2}$/.test(k)));
}

export function loadTerritoryNames(): Record<ProductLocale, Map<string, string>> {
  return Object.fromEntries(
    PRODUCT_LOCALES.map((l) => [l, parseTerritoryNames(readVerifiedJson<TerritoriesJson>(`S2-cldr-territories-${l}`), l)]),
  ) as Record<ProductLocale, Map<string, string>>;
}

type CurrencyDataJson = { supplemental: { currencyData: { region: Record<string, Array<Record<string, { _from?: string; _to?: string; _tender?: string }>>> } } };

/** Monedas vigentes de un territorio según CLDR: sin fecha de fin y no marcadas como _tender="false". */
export function parseCurrentTender(json: CurrencyDataJson): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [region, list] of Object.entries(json.supplemental.currencyData.region)) {
    const current = list.flatMap((o) => Object.entries(o)).filter(([, v]) => !v._to && v._tender !== "false").map(([code]) => code);
    out.set(region, [...new Set(current)].sort());
  }
  return out;
}
export const loadCurrentTender = () => parseCurrentTender(readVerifiedJson("S2-cldr-currencyData"));

type CodeMappingsJson = { supplemental: { codeMappings: Record<string, { _alpha3?: string; _numeric?: string }> } };
export function parseCodeMappings(json: CodeMappingsJson): Map<string, { alpha3?: string; numeric?: string }> {
  return new Map(Object.entries(json.supplemental.codeMappings).filter(([k]) => /^[A-Z]{2}$/.test(k)).map(([k, v]) => [k, { alpha3: v._alpha3, numeric: v._numeric }]));
}
export const loadCodeMappings = () => parseCodeMappings(readVerifiedJson("S2-cldr-codeMappings"));
