/** Adaptador: Debian iso-codes v4.20.1 (ISO 3166-1 y 3166-2). */
import { readVerifiedJson } from "../core/files";

export interface Iso3166_1 { alpha2: string; alpha3: string; numeric: string; name: string }
export interface Iso3166_2 { code: string; name: string; type: string; parent: string | null }

export function parseIso3166_1(json: { "3166-1": Array<{ alpha_2: string; alpha_3: string; numeric: string; name: string }> }): Iso3166_1[] {
  return json["3166-1"].map((c) => ({ alpha2: c.alpha_2, alpha3: c.alpha_3, numeric: c.numeric, name: c.name }));
}

export function parseIso3166_2(json: { "3166-2": Array<{ code: string; name: string; type: string; parent?: string }> }): Iso3166_2[] {
  // Para AR y VE la fuente es PLANA (sin parent): nunca se usa para construir jerarquías.
  return json["3166-2"].map((s) => ({ code: s.code, name: s.name, type: s.type, parent: s.parent ?? null }));
}

export const loadIso3166_1 = () => parseIso3166_1(readVerifiedJson("S1-iso3166-1"));
export const loadIso3166_2 = () => parseIso3166_2(readVerifiedJson("S1-iso3166-2"));
