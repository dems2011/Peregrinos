/** Adaptador: IANA tzdata 2026e (zone.tab dentro del tarball verificado). */
import { extractFromTarGz, readVerified } from "../core/files";

export interface TzdbData { version: string; zonesByCountry: Map<string, string[]>; allZones: Set<string> }

/** zone.tab: país<TAB>coordenadas<TAB>zona[<TAB>comentario]. Conserva el orden de la fuente. */
export function parseZoneTab(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [cc, , zone] = line.split("\t");
    if (!cc || !zone) continue;
    out.set(cc, [...(out.get(cc) ?? []), zone.trim()]);
  }
  return out;
}

export function loadTzdb(): TzdbData {
  const { buffer } = readVerified("S4-tzdb");
  const files = extractFromTarGz(buffer, ["zone.tab", "version"]);
  const zonesByCountry = parseZoneTab(files["zone.tab"]);
  return { version: files.version.trim(), zonesByCountry, allZones: new Set([...zonesByCountry.values()].flat()) };
}
