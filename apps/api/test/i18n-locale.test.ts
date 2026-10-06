/**
 * Infraestructura de idiomas y formato (ARQUITECTURA-INTERNACIONAL §6). Tests puros, sin base de datos.
 * Ejecutar: node --import tsx --test test/i18n-locale.test.ts (desde apps/api), o npm run test:a1.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_LOCALE, DEFAULT_TIMEZONE, INVALID_FORMAT, LEGACY_FORMAT_LOCALE, MESSAGES, SUPPORTED_LOCALES,
  createEventSchema, eventFormatOptions, formatDate, formatDateTime, formatLocale, formatMoney, formatNumber, formatTime,
  isLocale, isValidCurrency, isValidTimeZone, resolveLocale, resolveTimeZone, startOfDayInZone, t, timeZoneOffsetMinutes,
  toValidDate, toZonedInputValue, zonedDateKey, zonedTimeToUtc,
} from "@peregrinos/shared";

const BA = "America/Argentina/Buenos_Aires";
const ROME = "Europe/Rome";
const AT = "2026-10-06T17:05:00.000Z"; // 14:05 en Buenos Aires (UTC-3), 19:05 en Roma (CEST, UTC+2)
/** Intl usa espacios no separables (U+00A0 / U+202F); se normalizan para comparar. */
const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("resolveLocale", () => {
  it("acepta etiquetas BCP-47 y se queda con el idioma", () => {
    assert.equal(resolveLocale("es-AR"), "es");
    assert.equal(resolveLocale("pt-BR"), "pt");
    assert.equal(resolveLocale("EN_us"), "en");
    assert.equal(resolveLocale("it"), "it");
  });
  it("interpreta Accept-Language respetando q", () => {
    assert.equal(resolveLocale("de-DE,de;q=0.9,it;q=0.8,en;q=0.7"), "it");
    assert.equal(resolveLocale("en;q=0.5, pt-BR;q=0.9"), "pt");
    assert.equal(resolveLocale("fr, en;q=0"), "es");
    assert.equal(resolveLocale("*"), "es");
  });
  it("recorre una lista de candidatos en orden", () => {
    assert.equal(resolveLocale([null, "fr-FR", "pt-PT", "en"]), "pt");
    assert.equal(resolveLocale([]), "es");
  });
  it("cae a es si no hay nada soportado", () => {
    assert.equal(resolveLocale(undefined), DEFAULT_LOCALE);
    assert.equal(resolveLocale(null), "es");
    assert.equal(resolveLocale(""), "es");
    assert.equal(resolveLocale("de-DE"), "es");
    assert.equal(resolveLocale("zz"), "es");
  });
  it("isLocale valida contra SUPPORTED_LOCALES", () => {
    assert.deepEqual([...SUPPORTED_LOCALES], ["es", "en", "pt", "it"]);
    assert.ok(isLocale("pt"));
    assert.ok(!isLocale("pt-BR"));
    assert.ok(!isLocale("fr"));
  });
});

describe("formatLocale", () => {
  it("combina idioma y país", () => {
    assert.equal(formatLocale("es", "AR"), "es-AR");
    assert.equal(formatLocale("pt", "br"), "pt-BR");
    assert.equal(formatLocale("es", "419"), "es-419");
    assert.equal(LEGACY_FORMAT_LOCALE, "es-AR");
  });
  it("sin país (o país inválido) devuelve el idioma solo", () => {
    assert.equal(formatLocale("it"), "it");
    assert.equal(formatLocale("en", null), "en");
    assert.equal(formatLocale("en", "USA"), "en");
    assert.equal(formatLocale("fr", "FR"), "es-FR");
  });
});

describe("zona horaria", () => {
  it("usa el primer candidato válido y si no DEFAULT_TIMEZONE", () => {
    assert.equal(DEFAULT_TIMEZONE, BA);
    assert.equal(resolveTimeZone(ROME), ROME);
    assert.equal(resolveTimeZone(null, "No/Existe", ROME), ROME);
    assert.equal(resolveTimeZone(undefined, ""), BA);
  });
});

describe("formato de fechas y horas con zona explícita", () => {
  it("formatTime en 24 h", () => {
    assert.equal(formatTime(AT, { locale: "es-AR", timeZone: BA }), "14:05");
    assert.equal(formatTime(AT, { locale: "it-IT", timeZone: ROME }), "19:05");
    assert.equal(formatTime("2026-10-06T03:05:00Z", { locale: "en-US", timeZone: ROME }), "05:05");
    assert.equal(formatTime(new Date("2026-10-06T03:00:00Z"), { locale: "es-AR", timeZone: BA }), "00:00");
  });
  it("formatDate respeta zona y orden del idioma", () => {
    assert.equal(formatDate(AT, { locale: "es-AR", timeZone: BA }), "06/10/2026");
    assert.equal(formatDate("2026-10-06T02:00:00Z", { locale: "es-AR", timeZone: BA }), "05/10/2026");
    assert.equal(formatDate(AT, { locale: "en-US", timeZone: ROME }), "10/06/2026");
    assert.equal(formatDate(AT, { locale: "es-AR", timeZone: BA, compact: true }), "6/10/2026");
  });
  it("formatDateTime", () => {
    assert.equal(formatDateTime(AT, { locale: "es-AR", timeZone: BA }), "06/10/2026 · 14:05");
    assert.equal(formatDateTime(AT, { locale: "pt-BR", timeZone: ROME }), "06/10/2026 · 19:05");
  });
  it("una etiqueta inválida no rompe el formato", () => {
    assert.equal(formatTime(AT, { locale: "no es una etiqueta", timeZone: BA }), "14:05");
  });
});

describe("formato de números y montos", () => {
  it("formatNumber", () => {
    assert.equal(formatNumber(1234567, "es-AR"), "1.234.567");
    assert.equal(formatNumber(1234567, "en"), "1,234,567");
  });
  it("formatMoney con moneda explícita", () => {
    assert.equal(norm(formatMoney(1234567.5, "ARS", "es-AR")), "$ 1.234.567,50");
    assert.equal(norm(formatMoney(1234567.5, "EUR", "it-IT")), "1.234.567,50 €");
    assert.equal(norm(formatMoney("1234567.5", "USD", "en-US")), "$1,234,567.50");
    assert.equal(norm(formatMoney(1234567.5, "brl", "pt-BR")), "R$ 1.234.567,50");
  });
  it("formatNumber en cada idioma y con opciones", () => {
    assert.equal(formatNumber(1234567.891, "pt-BR"), "1.234.567,891");
    assert.equal(formatNumber(1234567.891, "it-IT"), "1.234.567,891");
    assert.equal(formatNumber(1234567.891, "en-US"), "1,234,567.891");
    assert.equal(formatNumber("1234567", "es-AR"), "1.234.567");
    assert.equal(norm(formatNumber(0.5, "es-AR", { style: "percent" })), "50%");
    assert.equal(formatNumber(2.5, "en-US", { minimumFractionDigits: 2 }), "2.50");
    assert.equal(formatNumber(1234567, undefined), "1.234.567", "sin idioma usa es-AR");
  });
  it("formatNumber no lanza con entradas inválidas", () => {
    assert.equal(formatNumber(NaN, "es-AR"), INVALID_FORMAT);
    assert.equal(formatNumber(Infinity, "es-AR"), INVALID_FORMAT);
    assert.equal(formatNumber("abc", "es-AR"), INVALID_FORMAT);
    assert.equal(formatNumber(null, "es-AR"), INVALID_FORMAT);
    assert.equal(formatNumber(1234567, "zz-??"), "1.234.567");
  });
  it("ARS, BRL, EUR y USD en cada idioma", () => {
    // Montos de 6+ cifras: algunos idiomas (es, it) no agrupan los de 4 cifras (minimumGroupingDigits = 2).
    const N = 1234567.5;
    const cases: [number, string, string, string][] = [
      [N, "ARS", "es-AR", "$ 1.234.567,50"],
      [N, "ARS", "en-US", "ARS 1,234,567.50"],
      [N, "ARS", "pt-BR", "ARS 1.234.567,50"],
      [N, "BRL", "pt-BR", "R$ 1.234.567,50"],
      [N, "BRL", "es-AR", "BRL 1.234.567,50"],
      [N, "BRL", "en-US", "R$1,234,567.50"],
      [N, "EUR", "it-IT", "1.234.567,50 €"],
      [N, "EUR", "es-ES", "1.234.567,50 €"],
      [N, "EUR", "en-US", "€1,234,567.50"],
      [N, "EUR", "pt-BR", "€ 1.234.567,50"],
      [N, "USD", "en-US", "$1,234,567.50"],
      [N, "USD", "es-AR", "US$ 1.234.567,50"],
      [N, "USD", "pt-BR", "US$ 1.234.567,50"],
      [N, "USD", "it-IT", "1.234.567,50 USD"],
    ];
    for (const [n, cur, loc, want] of cases) assert.equal(norm(formatMoney(n, cur, loc)), want, `${cur} ${loc}`);
  });
  it("montos negativos, cero, redondeo y decimales de la moneda", () => {
    assert.equal(norm(formatMoney(0, "ARS", "es-AR")), "$ 0,00");
    assert.equal(norm(formatMoney(-5, "USD", "en-US")), "-$5.00");
    assert.equal(norm(formatMoney(10.005, "EUR", "it-IT")), "10,01 €");
    assert.equal(norm(formatMoney(1234.5, "JPY", "en-US")), "¥1,235");
  });
  it("formatMoney no lanza: moneda inválida o ausente usa ARS; monto inválido → —", () => {
    assert.ok(isValidCurrency("usd"));
    assert.ok(!isValidCurrency("US"));
    assert.ok(!isValidCurrency("€"));
    assert.ok(!isValidCurrency(null));
    assert.equal(norm(formatMoney(10, "XX", "es-AR")), "$ 10,00");
    assert.equal(norm(formatMoney(10, null, null)), "$ 10,00");
    assert.equal(norm(formatMoney(10, undefined, "no-válido!")), "$ 10,00");
    assert.equal(formatMoney("abc", "ARS", "es-AR"), INVALID_FORMAT);
    assert.equal(formatMoney("", "ARS", "es-AR"), INVALID_FORMAT);
    assert.equal(formatMoney(null, "ARS", "es-AR"), INVALID_FORMAT);
    assert.equal(formatMoney(NaN, "ARS", "es-AR"), INVALID_FORMAT);
  });
});

const NY = "America/New_York";
const SYD = "Australia/Sydney";

describe("fechas en cada idioma", () => {
  it("formato numérico por idioma y país", () => {
    const want: Record<string, string> = { "es-AR": "06/10/2026", "en-US": "10/06/2026", "en-GB": "06/10/2026", "pt-BR": "06/10/2026", "it-IT": "06/10/2026" };
    for (const [loc, w] of Object.entries(want)) assert.equal(formatDate(AT, { locale: loc, timeZone: BA }), w, loc);
    for (const l of SUPPORTED_LOCALES) assert.match(formatTime(AT, { locale: l, timeZone: BA }), /^14:05$/, l);
  });
  it("mes con nombre (y sin año)", () => {
    assert.equal(norm(formatDate(AT, { locale: "es-AR", timeZone: BA, monthName: true })), "6 de oct de 2026");
    assert.equal(norm(formatDate(AT, { locale: "en-US", timeZone: BA, monthName: true })), "Oct 6, 2026");
    assert.equal(norm(formatDate(AT, { locale: "it-IT", timeZone: BA, monthName: true })), "6 ott 2026");
    assert.equal(norm(formatDate(AT, { locale: "pt-BR", timeZone: BA, monthName: true })), "6 de out. de 2026");
    assert.equal(norm(formatDate(AT, { locale: "es-AR", timeZone: BA, monthName: true, year: false })), "6 oct");
    assert.equal(norm(formatDateTime(AT, { locale: "es-AR", timeZone: BA, monthName: true, year: false })), "6 oct · 14:05");
  });
  it("formatDateTime usa el separador del catálogo de cada idioma", () => {
    for (const l of SUPPORTED_LOCALES) assert.ok(formatDateTime(AT, { locale: formatLocale(l, "AR"), timeZone: BA }).includes(" · 14:05"), l);
  });
});

describe("zona horaria del evento y cambios de hora (DST)", () => {
  it("desfase respecto de UTC", () => {
    assert.equal(timeZoneOffsetMinutes("2026-07-01T12:00:00Z", BA), -180);
    assert.equal(timeZoneOffsetMinutes("2026-07-01T12:00:00Z", ROME), 120);
    assert.equal(timeZoneOffsetMinutes("2026-01-15T12:00:00Z", ROME), 60);
    assert.equal(timeZoneOffsetMinutes("2026-01-15T12:00:00Z", SYD), 660);
    assert.equal(timeZoneOffsetMinutes("2026-07-01T12:00:00Z", SYD), 600);
    assert.equal(timeZoneOffsetMinutes("2026-01-15T12:00:00Z", "UTC"), 0);
    assert.equal(timeZoneOffsetMinutes("no es fecha", ROME), 0);
  });
  it("Roma: el mismo instante UTC cambia de hora local al terminar el horario de verano", () => {
    // 25/10/2026: 03:00 CEST → 02:00 CET (01:00 UTC). 02:30 local ocurre dos veces.
    assert.equal(formatTime("2026-10-25T00:30:00Z", { locale: "it-IT", timeZone: ROME }), "02:30");
    assert.equal(formatTime("2026-10-25T01:30:00Z", { locale: "it-IT", timeZone: ROME }), "02:30");
    assert.equal(formatTime("2026-10-24T12:00:00Z", { locale: "it-IT", timeZone: ROME }), "14:00");
    assert.equal(formatTime("2026-10-26T12:00:00Z", { locale: "it-IT", timeZone: ROME }), "13:00");
  });
  it("Sídney (hemisferio sur): fin del horario de verano en abril", () => {
    assert.equal(formatTime("2026-04-04T15:30:00Z", { locale: "en", timeZone: SYD }), "02:30");
    assert.equal(formatTime("2026-04-04T16:30:00Z", { locale: "en", timeZone: SYD }), "02:30");
  });
  it("la fecha de calendario depende de la zona", () => {
    assert.equal(zonedDateKey("2026-10-06T02:00:00Z", BA), "2026-10-05");
    assert.equal(zonedDateKey("2026-10-06T02:00:00Z", ROME), "2026-10-06");
    assert.equal(zonedDateKey("2026-10-06T23:30:00Z", SYD), "2026-10-07");
    assert.equal(zonedDateKey("x", BA), "");
  });
  it("hora de pared → UTC (datetime-local en la zona del evento)", () => {
    assert.equal(zonedTimeToUtc("2026-10-06T14:05", BA)?.toISOString(), AT);
    assert.equal(zonedTimeToUtc("2026-10-06T19:05", ROME)?.toISOString(), AT);
    assert.equal(zonedTimeToUtc("2026-10-06", BA)?.toISOString(), "2026-10-06T03:00:00.000Z");
    assert.equal(zonedTimeToUtc("2026-10-06 14:05:30", BA)?.toISOString(), "2026-10-06T17:05:30.000Z");
    // Hora repetida: primera ocurrencia (CEST).
    assert.equal(zonedTimeToUtc("2026-10-25T02:30", ROME)?.toISOString(), "2026-10-25T00:30:00.000Z");
    // Hora inexistente (29/03/2026 02:00→03:00): se adelanta a 03:30 CEST.
    assert.equal(zonedTimeToUtc("2026-03-29T02:30", ROME)?.toISOString(), "2026-03-29T01:30:00.000Z");
    assert.equal(zonedTimeToUtc("2026-03-08T02:30", NY)?.toISOString(), "2026-03-08T07:30:00.000Z");
    // Zona inválida → DEFAULT_TIMEZONE.
    assert.equal(zonedTimeToUtc("2026-10-06T14:05", "Mars/Base")?.toISOString(), AT);
  });
  it("zonedTimeToUtc rechaza texto inválido sin lanzar", () => {
    for (const bad of ["", "abc", "2026-02-30T10:00", "2026-13-01", "2026-10-06T25:00", null, undefined]) {
      assert.equal(zonedTimeToUtc(bad as string | null | undefined, BA), null, String(bad));
    }
  });
  it("toZonedInputValue ida y vuelta", () => {
    assert.equal(toZonedInputValue(AT, BA), "2026-10-06T14:05");
    assert.equal(toZonedInputValue(AT, ROME), "2026-10-06T19:05");
    assert.equal(toZonedInputValue(null, BA), "");
    assert.equal(toZonedInputValue("basura", BA), "");
    for (const zone of [BA, ROME, NY, SYD]) {
      assert.equal(zonedTimeToUtc(toZonedInputValue(AT, zone), zone)?.toISOString(), AT, zone);
    }
  });
  it("inicio del día en la zona, también en días de 23 y 25 horas", () => {
    assert.equal(startOfDayInZone(AT, BA).toISOString(), "2026-10-06T03:00:00.000Z");
    assert.equal(startOfDayInZone(AT, BA, 1).toISOString(), "2026-10-05T03:00:00.000Z");
    assert.equal(startOfDayInZone(AT, ROME).toISOString(), "2026-10-05T22:00:00.000Z");
    // Nueva York, 08/03/2026 (día de 23 h).
    const d0 = startOfDayInZone("2026-03-08T15:00:00Z", NY);
    const d1 = startOfDayInZone("2026-03-09T15:00:00Z", NY);
    assert.equal(d0.toISOString(), "2026-03-08T05:00:00.000Z");
    assert.equal(d1.toISOString(), "2026-03-09T04:00:00.000Z");
    assert.equal((d1.getTime() - d0.getTime()) / 3_600_000, 23);
    // Roma, 25/10/2026 (día de 25 h).
    const r0 = startOfDayInZone("2026-10-25T12:00:00Z", ROME);
    const r1 = startOfDayInZone("2026-10-26T12:00:00Z", ROME);
    assert.equal((r1.getTime() - r0.getTime()) / 3_600_000, 25);
    // daysAgo cruzando el cambio de hora.
    assert.equal(startOfDayInZone("2026-10-26T12:00:00Z", ROME, 2).toISOString(), "2026-10-23T22:00:00.000Z");
  });
  it("opciones de formato a partir del evento", () => {
    assert.deepEqual(eventFormatOptions({ timezone: ROME }), { locale: LEGACY_FORMAT_LOCALE, timeZone: ROME });
    assert.deepEqual(eventFormatOptions({ timezone: "Bad/Zone" }, "pt-BR"), { locale: "pt-BR", timeZone: BA });
    assert.deepEqual(eventFormatOptions(null), { locale: "es-AR", timeZone: BA });
    assert.equal(formatDateTime(AT, eventFormatOptions({ timezone: ROME }, "it-IT")), "06/10/2026 · 19:05");
  });
  it("el alta de evento valida la zona IANA y usa DEFAULT_TIMEZONE por defecto", () => {
    const base = { name: "Peregrinación", startsAt: AT };
    assert.equal(createEventSchema.parse(base).timezone, DEFAULT_TIMEZONE);
    assert.equal(createEventSchema.parse({ ...base, timezone: ROME }).timezone, ROME);
    assert.ok(!createEventSchema.safeParse({ ...base, timezone: "Mars/Base" }).success);
    assert.ok(isValidTimeZone("UTC"));
    assert.ok(!isValidTimeZone(""));
    assert.ok(!isValidTimeZone(42));
  });
});

describe("fuentes: el formato pasa por los helpers compartidos", () => {
  const root = join(__dirname, "../../..");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(join(dir, e.name))) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : []);
  const files = [...walk(join(root, "apps/web/src")), ...walk(join(root, "apps/api/src"))];
  it("no hay toLocale*String ni etiquetas \"es-AR\" fijas en apps/web y apps/api", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (/\.toLocale(Date|Time)?String\(/.test(src) || /["'`]es-AR["'`]/.test(src)) offenders.push(f.slice(root.length + 1));
    }
    assert.deepEqual(offenders, []);
  });
  it("los <input type=\"datetime-local\"> no convierten con la zona del navegador", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return src.includes("datetime-local") && (/getTimezoneOffset\(/.test(src) || /new Date\(\w+(\.\w+)*\)\.toISOString\(\)/.test(src));
    });
    assert.deepEqual(offenders.map((f) => f.slice(root.length + 1)), []);
  });
});

describe("respaldos y entradas inválidas (nunca lanzan)", () => {
  it("fechas inválidas → —", () => {
    for (const bad of ["no es fecha", "", NaN, new Date("x")]) {
      assert.equal(formatTime(bad as string, { locale: "es-AR", timeZone: BA }), INVALID_FORMAT);
      assert.equal(formatDate(bad as string, { locale: "es-AR", timeZone: BA }), INVALID_FORMAT);
      assert.equal(formatDateTime(bad as string, { locale: "es-AR", timeZone: BA }), INVALID_FORMAT);
    }
    assert.equal(formatDate(null as unknown as string), INVALID_FORMAT);
    assert.equal(toValidDate("x"), null);
    assert.equal(toValidDate({}), null);
    assert.equal(toValidDate(0)?.toISOString(), "1970-01-01T00:00:00.000Z");
  });
  it("sin opciones usa es-AR y DEFAULT_TIMEZONE", () => {
    assert.equal(formatTime(AT), "14:05");
    assert.equal(formatDate(AT), "06/10/2026");
    assert.equal(formatDateTime(AT), "06/10/2026 · 14:05");
    assert.equal(formatDateTime(AT, { locale: null, timeZone: null }), "06/10/2026 · 14:05");
  });
  it("zona desconocida → DEFAULT_TIMEZONE; idioma desconocido → es", () => {
    assert.equal(formatTime(AT, { locale: "es-AR", timeZone: "Mars/Base" }), "14:05");
    assert.equal(formatDate(AT, { locale: "zz", timeZone: BA }), formatDate(AT, { locale: LEGACY_FORMAT_LOCALE, timeZone: BA }));
    assert.equal(norm(formatMoney(10, "ARS", "zz")), "$ 10,00");
    assert.equal(formatDateTime(AT, { locale: "fr-FR", timeZone: ROME }).endsWith("· 19:05"), true);
    assert.equal(resolveTimeZone(42 as unknown as string), BA);
  });
});

describe("mensajes", () => {
  it("t traduce, interpola y cae a es", () => {
    assert.equal(t("it", "common.cancel"), "Annulla");
    assert.equal(t("pt-BR", "common.yes"), "Sim");
    assert.equal(t("fr", "common.yes"), "Sí");
    assert.equal(t(null, "common.save"), "Guardar");
    assert.equal(t("en", "format.dateTime", { date: "D", time: "T" }), "D · T");
    assert.equal(t("en", "format.dateTime", { date: "D" }), "D · {time}");
    assert.equal(t("es", "date.expiresOn", { date: "6/10/2026" }), "Vence el 6/10/2026.");
    assert.equal(t("es", "format.dateTime", { constructor: "x" } as Record<string, string>), "{date} · {time}");
  });
  it("cada idioma tiene su texto (no copia de es salvo símbolos)", () => {
    const want = { es: "Cerrar", en: "Close", pt: "Fechar", it: "Chiudi" } as const;
    for (const l of SUPPORTED_LOCALES) assert.equal(t(l, "common.close"), want[l], l);
    for (const l of SUPPORTED_LOCALES) assert.equal(t(l, "format.dateRange", { start: "A", end: "B" }), "A – B", l);
  });
  it("si falta la clave en un idioma se usa es", () => {
    const en = MESSAGES.en as Record<string, string>;
    const saved = en["common.save"];
    delete en["common.save"];
    try {
      assert.equal(t("en", "common.save"), "Guardar");
    } finally {
      en["common.save"] = saved;
    }
  });
  it("los cuatro archivos de mensajes tienen exactamente las mismas claves", () => {
    const dir = join(__dirname, "../../../packages/shared/src/i18n");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    assert.deepEqual(files, ["en.json", "es.json", "it.json", "pt.json"]);
    const keys = (f: string) => Object.keys(JSON.parse(readFileSync(join(dir, f), "utf8"))).sort();
    const ref = keys("es.json");
    for (const f of files) assert.deepEqual(keys(f), ref, f);
    for (const l of SUPPORTED_LOCALES) assert.deepEqual(Object.keys(MESSAGES[l]).sort(), ref, l);
    for (const l of SUPPORTED_LOCALES) for (const k of ref) assert.ok((MESSAGES[l] as Record<string, string>)[k], `${l}:${k} vacío`);
  });
});
