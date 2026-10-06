/**
 * Construcción del catálogo de países (lógica de catálogo, sin conocer formatos de archivo).
 *  - Catálogo mundial: TODOS los ISO 3166-1, con código, ISO-3 y nombres CLDR es/en/pt/it. Perfil vacío, PENDING.
 *  - 24 prioritarios: además moneda, prefijo y zonas horarias, con reglas de verificación estrictas.
 * Un dato dudoso nunca se carga: queda null y el país pasa a REVIEW_REQUIRED.
 */
import { PRODUCT_LOCALES, type CanonicalCountry, type Finding, type ProductLocale } from "../core/model";
import type { Iso3166_1 } from "../sources/isoCodes";
import type { Iso4217List } from "../sources/iso4217";
import { currenciesFor } from "../sources/iso4217";
import type { PhoneTerritory } from "../sources/libphonenumber";

export interface CountryInputs {
  iso3166_1: Iso3166_1[];
  names: Record<ProductLocale, Map<string, string>>;
  codeMappings: Map<string, { alpha3?: string; numeric?: string }>;
  cldrTender: Map<string, string[]>;
  iso4217: Iso4217List;
  iso4217Names: Record<string, string>;
  zonesByCountry: Map<string, string[]>;
  phoneTerritories: Map<string, PhoneTerritory>;
  priority: string[];
  itu: { contrast: Record<string, string>; operationalOverrides: Record<string, { operationalPrefix: string; ituAssigned: string | string[]; decision: string }> };
  /** Decisiones de moneda aprobadas para casos que ISO 4217 + CLDR no resuelven (config/currency-decisions.json). */
  currencyDecisions: Record<string, { currencyCode: string; basis: string }>;
  /** Indica si el entorno puede usar la zona (acepta alias IANA; no solo los IDs canónicos de CLDR). */
  isRuntimeZone: (zone: string) => boolean;
}

export const CURRENCY_RULE =
  "VERIFICADA si ISO 4217 lista exactamente UNA moneda (sin fondos) para el país y CLDR currencyData indica exactamente esa misma como única vigente. En cualquier otro caso: REVIEW_REQUIRED y currencyCode=null.";

export function decideCurrency(iso: string[], cldr: string[]): { code: string | null; conflict: boolean } {
  if (iso.length === 1 && cldr.length === 1 && iso[0] === cldr[0]) return { code: iso[0], conflict: false };
  return { code: null, conflict: true };
}

export function buildCountries(inp: CountryInputs): { countries: CanonicalCountry[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const prio = new Set(inp.priority);
  const phoneByCode = new Map<string, string[]>();
  for (const t of inp.phoneTerritories.values()) phoneByCode.set(t.countryCode, [...(phoneByCode.get(t.countryCode) ?? []), t.id]);

  const countries = inp.iso3166_1.map((c): CanonicalCountry => {
    const notes: string[] = [];
    let disposition: CanonicalCountry["disposition"] = "OK";
    const names = Object.fromEntries(PRODUCT_LOCALES.map((l) => [l, inp.names[l].get(c.alpha2) ?? ""])) as CanonicalCountry["names"];
    for (const l of PRODUCT_LOCALES) if (!names[l]) { disposition = "REJECTED"; notes.push(`Sin nombre CLDR en ${l}`); }

    const cm = inp.codeMappings.get(c.alpha2);
    if (!cm) { disposition = disposition === "REJECTED" ? disposition : "REVIEW_REQUIRED"; notes.push("CLDR codeMappings no tiene el código"); }
    else {
      if (cm.alpha3 && cm.alpha3 !== c.alpha3) { disposition = "REVIEW_REQUIRED"; notes.push(`ISO-3 distinto: iso-codes ${c.alpha3} / CLDR ${cm.alpha3}`); }
      if (cm.numeric && cm.numeric !== c.numeric) { disposition = "REVIEW_REQUIRED"; notes.push(`Numérico distinto: iso-codes ${c.numeric} / CLDR ${cm.numeric}`); }
    }

    const country: CanonicalCountry = {
      code: c.alpha2, iso3: c.alpha3, isoNumeric: c.numeric, names, locales: [...PRODUCT_LOCALES],
      currencyCode: null, phonePrefix: null, timezones: [], reviewStatus: "PENDING",
      isPriority: prio.has(c.alpha2), disposition, notes, evidence: {},
    };
    if (!country.isPriority) return country;

    // --- Moneda ---
    const isoName = inp.iso4217Names[c.alpha2];
    const iso = isoName ? currenciesFor(inp.iso4217, isoName) : { found: false, currencies: [], funds: [] };
    const cldr = inp.cldrTender.get(c.alpha2) ?? [];
    country.evidence.currency = { iso4217: iso.currencies, iso4217Funds: iso.funds, cldrCurrent: cldr, rule: CURRENCY_RULE };
    if (!iso.found) { country.disposition = "REVIEW_REQUIRED"; notes.push(`ISO 4217: nombre "${isoName}" no encontrado en List One`); }
    else {
      const d = decideCurrency(iso.currencies, cldr);
      country.currencyCode = d.code;
      const decision = inp.currencyDecisions[c.alpha2];
      if (d.conflict && decision) {
        // Decisión aprobada: solo válida si el código figura en ISO 4217 List One para el país.
        if (iso.currencies.includes(decision.currencyCode)) {
          country.currencyCode = decision.currencyCode;
          country.evidence.currency.decision = decision;
          notes.push(`Moneda por decisión aprobada: ${decision.currencyCode} (ISO 4217 [${iso.currencies.join(", ")}] · CLDR [${cldr.join(", ")}])`);
        } else {
          if (country.disposition === "OK") country.disposition = "REVIEW_REQUIRED";
          findings.push({ severity: "ERROR", code: "CURRENCY_DECISION_INVALID", message: `La decisión ${decision.currencyCode} no figura en ISO 4217 para el país [${iso.currencies.join(", ")}]`, ref: c.alpha2 });
        }
      } else if (d.conflict) {
        if (country.disposition === "OK") country.disposition = "REVIEW_REQUIRED";
        notes.push(`Conflicto de moneda: ISO 4217 [${iso.currencies.join(", ")}] · CLDR vigente [${cldr.join(", ")}] → currencyCode sin determinar`);
        findings.push({ severity: "WARNING", code: "CURRENCY_CONFLICT", message: `ISO 4217 [${iso.currencies.join(", ")}] vs CLDR [${cldr.join(", ")}]`, ref: c.alpha2 });
      }
    }

    // --- Prefijo telefónico (libphonenumber; contraste UIT manual) ---
    const t = inp.phoneTerritories.get(c.alpha2);
    const override = inp.itu.operationalOverrides[c.alpha2];
    const ituStatus = inp.itu.contrast[c.alpha2] ?? "PENDING";
    const value = t ? `+${t.countryCode}` : null;
    country.evidence.phone = { source: "libphonenumber v9.0.40", value, ituContrast: ituStatus };
    if (!t) { if (country.disposition === "OK") country.disposition = "REVIEW_REQUIRED"; notes.push("libphonenumber no tiene el territorio"); }
    else {
      const shared = (phoneByCode.get(t.countryCode) ?? []).filter((x) => x !== c.alpha2).sort();
      if (shared.length) country.evidence.phone.sharedWith = shared;
      if (override) {
        country.evidence.phone.note = `${override.decision} (UIT asigna ${[override.ituAssigned].flat().join(" y ")})`;
        if (value !== override.operationalPrefix) {
          if (country.disposition === "OK") country.disposition = "REVIEW_REQUIRED";
          notes.push(`libphonenumber da ${value} pero el valor operativo decidido es ${override.operationalPrefix}`);
          findings.push({ severity: "ERROR", code: "PHONE_OVERRIDE_MISMATCH", message: `${value} ≠ ${override.operationalPrefix}`, ref: c.alpha2 });
        }
        country.phonePrefix = override.operationalPrefix;
      } else country.phonePrefix = value;
    }

    // --- Zonas horarias (IANA tzdb; nunca una zona artificial única) ---
    const zones = inp.zonesByCountry.get(c.alpha2) ?? [];
    country.timezones = [...zones];
    const notInRuntime = zones.filter((z) => !inp.isRuntimeZone(z));
    country.evidence.timezones = { source: "IANA tzdb", count: zones.length, notInRuntimeIntl: notInRuntime };
    if (!zones.length) { if (country.disposition === "OK") country.disposition = "REVIEW_REQUIRED"; notes.push("tzdb no lista zonas para el país"); }
    if (notInRuntime.length) findings.push({ severity: "WARNING", code: "TZ_NOT_IN_RUNTIME", message: `Zonas de la tzdb que el Intl del entorno no reconoce: ${notInRuntime.join(", ")}`, ref: c.alpha2 });

    // --- Verificación ---
    if (ituStatus !== "CONFIRMED") notes.push("Contraste de prefijo con la UIT pendiente (bloquea VERIFIED)");
    if (country.disposition === "OK" && country.currencyCode && country.phonePrefix && country.timezones.length && ituStatus === "CONFIRMED") country.reviewStatus = "VERIFIED";
    return country;
  });

  return { countries, findings };
}
