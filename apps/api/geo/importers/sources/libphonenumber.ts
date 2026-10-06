/** Adaptador: libphonenumber v9.0.40 — SOLO el código de país E.164 por territorio. */
import { readVerifiedText } from "../core/files";

export interface PhoneTerritory { id: string; countryCode: string; mainCountryForCode: boolean }

/**
 * Extrae <territory id=".." countryCode=".."> de PhoneNumberMetadata.xml.
 * Descarta "001" y cualquier id que no sea un alfa-2 ISO 3166-1 (entidades no geográficas).
 */
export function parsePhoneTerritories(xml: string, iso2: Set<string>): { territories: Map<string, PhoneTerritory>; discarded: string[] } {
  const territories = new Map<string, PhoneTerritory>();
  const discarded: string[] = [];
  for (const m of xml.matchAll(/<territory\s+([^>]*?)>/g)) {
    const attrs = m[1];
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    const countryCode = /\bcountryCode="([0-9]+)"/.exec(attrs)?.[1];
    if (!id || !countryCode) continue;
    if (!/^[A-Z]{2}$/.test(id) || !iso2.has(id)) { discarded.push(`${id}(+${countryCode})`); continue; }
    territories.set(id, { id, countryCode, mainCountryForCode: /\bmainCountryForCode="true"/.test(attrs) });
  }
  return { territories, discarded };
}

export const loadPhoneTerritories = (iso2: Set<string>) => parsePhoneTerritories(readVerifiedText("S5-libphonenumber"), iso2);
