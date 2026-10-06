/**
 * D2 — CountryAreaLevel por país (AR y VE), contrastados con su fuente.
 * Los niveles salen de las propuestas levels/<CC>.json y quedan SIEMPRE con reviewStatus=PENDING
 * hasta que el usuario los confirme. El contraste es evidencia para esa confirmación, no la sustituye.
 */
import path from "node:path";
import { GEO_DIR, readJsonFile } from "../core/files";
import type { AreaKind, CanonicalArea, CanonicalLevel, LocalizedText } from "../core/model";
import type { Iso3166_2 } from "../sources/isoCodes";

interface LevelsFile {
  status: string;
  countryCode: string;
  levels: Array<{
    rank: number; kind: AreaKind; isRequired: boolean; labels: LocalizedText;
    contrast?: { source: string; expectedCount?: number; iso3166_2Types?: string[]; expectedCategories?: string[] };
  }>;
}

export type LevelContrastStatus = "MATCH" | "MISMATCH" | "PENDING_SOURCE";
export interface LevelContrast {
  countryCode: string;
  rank: number;
  source: string;
  expected: number | null;
  observed: number | null;
  status: LevelContrastStatus;
  detail: string;
}

export const LEVEL_COUNTRIES = ["AR", "VE"] as const;

export function loadLevelsFile(countryCode: string): LevelsFile {
  return readJsonFile<LevelsFile>(path.join(GEO_DIR, "levels", `${countryCode}.json`));
}

export function toCanonicalLevels(file: LevelsFile): CanonicalLevel[] {
  return file.levels.map((l) => ({
    countryCode: file.countryCode, rank: l.rank, kind: l.kind, labels: l.labels, isRequired: l.isRequired,
    reviewStatus: "PENDING", status: file.status === "APPROVED" ? "APPROVED" : "PROVISIONAL",
  }));
}

/**
 * Contrasta cada nivel declarado con lo que la fuente realmente contiene:
 *  - source=GEOREF: cantidad de áreas construidas en ese rango y categorías observadas.
 *  - source=ISO3166-2: cantidad de subdivisiones ISO del país con los tipos indicados.
 *  - cualquier otra fuente (no aprobada/no descargada): PENDING_SOURCE, sin inferir nada.
 */
export function contrastLevels(file: LevelsFile, ctx: { areas: CanonicalArea[]; iso3166_2: Iso3166_2[] }): LevelContrast[] {
  return file.levels.map((l): LevelContrast => {
    const base = { countryCode: file.countryCode, rank: l.rank, source: l.contrast?.source ?? "—" };
    const c = l.contrast;
    if (!c) return { ...base, expected: null, observed: null, status: "PENDING_SOURCE", detail: "Sin fuente de contraste declarada" };

    if (c.source === "GEOREF") {
      const inRank = ctx.areas.filter((a) => a.countryCode === file.countryCode && a.rank === l.rank);
      const wrongKind = inRank.filter((a) => a.kind !== l.kind).length;
      const cats = [...new Set(inRank.map((a) => String(a.sourceExtra?.categoria ?? "")))].sort();
      const unexpectedCats = c.expectedCategories ? cats.filter((x) => !c.expectedCategories!.includes(x)) : [];
      const countOk = c.expectedCount === undefined || c.expectedCount === inRank.length;
      const ok = countOk && wrongKind === 0 && unexpectedCats.length === 0 && inRank.length > 0;
      return {
        ...base, expected: c.expectedCount ?? null, observed: inRank.length, status: ok ? "MATCH" : "MISMATCH",
        detail: `categorías observadas: ${cats.join(", ")}` + (wrongKind ? ` · ${wrongKind} con kind distinto de ${l.kind}` : "") + (unexpectedCats.length ? ` · categorías no previstas: ${unexpectedCats.join(", ")}` : ""),
      };
    }

    if (c.source === "ISO3166-2") {
      const subs = ctx.iso3166_2.filter((s) => s.code.startsWith(`${file.countryCode}-`) && (!c.iso3166_2Types || c.iso3166_2Types.includes(s.type)));
      const byType = Object.entries(subs.reduce<Record<string, number>>((acc, s) => ((acc[s.type] = (acc[s.type] ?? 0) + 1), acc), {})).map(([k, v]) => `${k}=${v}`).join(", ");
      const ok = c.expectedCount === undefined ? subs.length > 0 : subs.length === c.expectedCount;
      return { ...base, expected: c.expectedCount ?? null, observed: subs.length, status: ok ? "MATCH" : "MISMATCH", detail: `ISO 3166-2: ${byType}` };
    }

    return { ...base, expected: c.expectedCount ?? null, observed: null, status: "PENDING_SOURCE", detail: `Fuente ${c.source} no aprobada/no descargada: sin contraste` };
  });
}
