/** Adaptador: ISO 4217 List One (SIX). El país viene por NOMBRE en inglés (CtryNm), no por código. */
import { readVerifiedText } from "../core/files";

export interface Iso4217Entry { countryName: string; code: string | null; isFund: boolean }
export interface Iso4217List { published: string | null; entries: Iso4217Entry[]; codes: Set<string> }

const unescapeXml = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export function parseIso4217(xml: string): Iso4217List {
  const published = /<ISO_4217\b[^>]*\bPblshd="([^"]+)"/.exec(xml)?.[1] ?? null;
  const entries: Iso4217Entry[] = [];
  for (const m of xml.matchAll(/<CcyNtry>([\s\S]*?)<\/CcyNtry>/g)) {
    const body = m[1];
    const countryName = unescapeXml((/<CtryNm>([\s\S]*?)<\/CtryNm>/.exec(body)?.[1] ?? "").trim());
    const code = /<Ccy>([A-Z]{3})<\/Ccy>/.exec(body)?.[1] ?? null;
    const isFund = /<CcyNm\b[^>]*IsFund="true"/.test(body);
    entries.push({ countryName, code, isFund });
  }
  return { published, entries, codes: new Set(entries.map((e) => e.code).filter((c): c is string => !!c)) };
}

export const loadIso4217 = () => parseIso4217(readVerifiedText("S3-iso4217-list-one"));

/** Monedas (no fondos) de un país identificado por su nombre EXACTO en List One. */
export function currenciesFor(list: Iso4217List, countryName: string): { currencies: string[]; funds: string[]; found: boolean } {
  const rows = list.entries.filter((e) => e.countryName === countryName);
  return {
    found: rows.length > 0,
    currencies: [...new Set(rows.filter((r) => r.code && !r.isFund).map((r) => r.code!))].sort(),
    funds: [...new Set(rows.filter((r) => r.code && r.isFund).map((r) => r.code!))].sort(),
  };
}
