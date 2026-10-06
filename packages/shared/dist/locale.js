"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MESSAGES = exports.INVALID_FORMAT = exports.LEGACY_FORMAT_LOCALE = exports.LEGACY_DEFAULT_CURRENCY = exports.LEGACY_DEFAULT_COUNTRY = exports.DEFAULT_TIMEZONE = exports.isLocale = exports.LOCALE_NAMES = exports.DEFAULT_LOCALE = exports.SUPPORTED_LOCALES = void 0;
exports.resolveLocale = resolveLocale;
exports.formatLocale = formatLocale;
exports.isValidTimeZone = isValidTimeZone;
exports.resolveTimeZone = resolveTimeZone;
exports.toValidDate = toValidDate;
exports.eventFormatOptions = eventFormatOptions;
exports.formatTime = formatTime;
exports.formatDate = formatDate;
exports.formatDateTime = formatDateTime;
exports.formatNumber = formatNumber;
exports.isValidCurrency = isValidCurrency;
exports.formatMoney = formatMoney;
exports.zonedParts = zonedParts;
exports.timeZoneOffsetMinutes = timeZoneOffsetMinutes;
exports.zonedTimeToUtc = zonedTimeToUtc;
exports.toZonedInputValue = toZonedInputValue;
exports.zonedDateKey = zonedDateKey;
exports.startOfDayInZone = startOfDayInZone;
exports.t = t;
/**
 * Infraestructura de idiomas y formato (ARQUITECTURA-INTERNACIONAL §6). Se reexporta desde index.ts.
 *
 * - El idioma (`Locale`) es independiente del país: se guarda como código BCP-47 corto validado contra SUPPORTED_LOCALES.
 * - Para formatear con Intl se combina idioma + país (`formatLocale("es", "AR")` → "es-AR").
 * - Toda fecha/hora se formatea con una zona horaria explícita (la del evento u organización).
 * - Los montos siempre llevan su moneda explícita.
 */
const es_json_1 = __importDefault(require("./i18n/es.json"));
const en_json_1 = __importDefault(require("./i18n/en.json"));
const pt_json_1 = __importDefault(require("./i18n/pt.json"));
const it_json_1 = __importDefault(require("./i18n/it.json"));
// ───────────────────────────── Idiomas ─────────────────────────────
exports.SUPPORTED_LOCALES = ["es", "en", "pt", "it"];
exports.DEFAULT_LOCALE = "es";
exports.LOCALE_NAMES = { es: "Español", en: "English", pt: "Português", it: "Italiano" };
const isLocale = (v) => typeof v === "string" && exports.SUPPORTED_LOCALES.includes(v);
exports.isLocale = isLocale;
/** Idioma principal de una etiqueta BCP-47 ("pt-BR" → "pt"), o null si no está soportado. */
function primaryLocale(tag) {
    const primary = tag.trim().split(/[-_]/)[0]?.toLowerCase();
    return (0, exports.isLocale)(primary) ? primary : null;
}
/** Interpreta un encabezado Accept-Language ("pt-BR,pt;q=0.9,en;q=0.8") en etiquetas ordenadas por preferencia (q=0 se descarta). */
function parseAcceptLanguage(header) {
    return header
        .split(",")
        .map((part, i) => {
        const [tag, ...params] = part.trim().split(";");
        const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
        const q = qParam ? Number(qParam.slice(2)) : 1;
        return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, i };
    })
        .filter((x) => x.tag && x.tag !== "*" && x.q > 0)
        .sort((a, b) => b.q - a.q || a.i - b.i)
        .map((x) => x.tag);
}
/**
 * Resuelve el idioma a usar a partir de una etiqueta BCP-47 ("es-AR"), un encabezado Accept-Language
 * (con valores q) o una lista de candidatos en orden de preferencia (p. ej. [usuario, organización, navegador]).
 * Si nada coincide, devuelve DEFAULT_LOCALE.
 */
function resolveLocale(input) {
    const candidates = Array.isArray(input) ? input : [input];
    for (const c of candidates) {
        if (!c)
            continue;
        for (const tag of parseAcceptLanguage(c)) {
            const l = primaryLocale(tag);
            if (l)
                return l;
        }
    }
    return exports.DEFAULT_LOCALE;
}
/**
 * Etiqueta BCP-47 para Intl: idioma + país opcional (ISO 3166-1 alfa-2 o UN M49 numérico).
 * formatLocale("es", "AR") → "es-AR"; formatLocale("pt", "br") → "pt-BR"; formatLocale("it") → "it".
 */
function formatLocale(locale, country) {
    const l = resolveLocale(locale);
    const c = country?.trim();
    if (c && /^([A-Za-z]{2}|\d{3})$/.test(c))
        return `${l}-${c.toUpperCase()}`;
    return l;
}
// ─────────────────────── Valores por defecto heredados ───────────────────────
/**
 * Zona horaria de respaldo. Los eventos y datos existentes la asumen (parroquia inicial en Argentina);
 * usar solo cuando el evento/organización no informa su propia zona.
 */
exports.DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";
/** País de formato heredado: mantiene la salida "es-AR" mientras usuarios/organizaciones no tengan país/idioma propios. */
exports.LEGACY_DEFAULT_COUNTRY = "AR";
/** Moneda heredada para montos que todavía no guardan su moneda (pendiente G6 `money_currency`). */
exports.LEGACY_DEFAULT_CURRENCY = "ARS";
/** Etiqueta Intl heredada ("es-AR"). */
exports.LEGACY_FORMAT_LOCALE = formatLocale(exports.DEFAULT_LOCALE, exports.LEGACY_DEFAULT_COUNTRY);
/** true si la zona IANA es válida en este entorno (incluye alias como America/Argentina/Buenos_Aires). */
function isValidTimeZone(zone) {
    if (typeof zone !== "string" || !zone)
        return false;
    try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return true;
    }
    catch {
        return false;
    }
}
/** Primera zona horaria válida entre los candidatos (p. ej. evento, organización), o DEFAULT_TIMEZONE. */
function resolveTimeZone(...candidates) {
    for (const z of candidates)
        if (isValidTimeZone(z))
            return z;
    return exports.DEFAULT_TIMEZONE;
}
/** Texto que devuelven los formateadores cuando la entrada no es válida (nunca lanzan). */
exports.INVALID_FORMAT = "—";
/** Etiqueta válida para Intl; si es inválida, vacía o no soportada por el entorno, cae a la heredada ("es-AR"). */
function intlTag(locale) {
    if (!locale || typeof locale !== "string")
        return exports.LEGACY_FORMAT_LOCALE;
    try {
        const tag = Intl.getCanonicalLocales(locale)[0];
        return tag && Intl.DateTimeFormat.supportedLocalesOf(tag).length ? tag : exports.LEGACY_FORMAT_LOCALE;
    }
    catch {
        return exports.LEGACY_FORMAT_LOCALE;
    }
}
/** Convierte a Date; null si la entrada no representa un instante válido. */
function toValidDate(v) {
    if (v === null || v === undefined || v === "")
        return null;
    const d = v instanceof Date ? v : typeof v === "string" || typeof v === "number" ? new Date(v) : null;
    return d && Number.isFinite(d.getTime()) ? d : null;
}
/** Opciones de formato a partir de un evento (su zona horaria) y un idioma/etiqueta opcional. */
function eventFormatOptions(event, locale) {
    return { locale: intlTag(locale), timeZone: resolveTimeZone(event?.timezone) };
}
function safeFormat(value, opts, fmt) {
    const d = toValidDate(value);
    if (!d)
        return exports.INVALID_FORMAT;
    try {
        return new Intl.DateTimeFormat(intlTag(opts?.locale), { ...fmt, timeZone: resolveTimeZone(opts?.timeZone) }).format(d);
    }
    catch {
        return d.toISOString();
    }
}
/** Hora en 24 h "HH:mm" en la zona indicada. */
function formatTime(value, opts) {
    return safeFormat(value, opts, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
/**
 * Fecha en el orden del idioma/país, en la zona indicada.
 * Numérica: es-AR "06/10/2026", en-US "10/06/2026"; `compact: true` → "6/10/2026".
 * `monthName: true` → "6 oct 2026" (es), "Oct 6, 2026" (en); con `year: false` → "6 oct".
 */
function formatDate(value, opts) {
    if (opts?.monthName) {
        return safeFormat(value, opts, { day: "numeric", month: "short", ...(opts.year === false ? {} : { year: "numeric" }) });
    }
    const d = opts?.compact ? "numeric" : "2-digit";
    return safeFormat(value, opts, { day: d, month: d, year: "numeric" });
}
/** Fecha y hora: "06/10/2026 · 14:05" (el separador sale de los mensajes del idioma). */
function formatDateTime(value, opts) {
    if (!toValidDate(value))
        return exports.INVALID_FORMAT;
    return t(resolveLocale(opts?.locale), "format.dateTime", { date: formatDate(value, opts), time: formatTime(value, opts) });
}
/** Número con separadores del idioma/país (es-AR "1.234"). Entrada no numérica → INVALID_FORMAT. */
function formatNumber(value, locale, options) {
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (!Number.isFinite(n))
        return exports.INVALID_FORMAT;
    try {
        return new Intl.NumberFormat(intlTag(locale), options).format(n);
    }
    catch {
        return new Intl.NumberFormat(intlTag(locale)).format(n);
    }
}
/** true si es un código ISO 4217 que Intl acepta. */
function isValidCurrency(code) {
    if (typeof code !== "string" || !/^[A-Za-z]{3}$/.test(code))
        return false;
    try {
        new Intl.NumberFormat("en", { style: "currency", currency: code });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Monto con moneda ISO 4217 explícita: formatMoney(1234.5, "ARS", "es-AR") → "$ 1.234,50".
 * Moneda inválida o ausente → LEGACY_DEFAULT_CURRENCY; monto no numérico → INVALID_FORMAT.
 */
function formatMoney(amount, currency, locale) {
    const n = typeof amount === "number" ? amount : typeof amount === "string" && amount.trim() !== "" ? Number(amount) : NaN;
    if (!Number.isFinite(n))
        return exports.INVALID_FORMAT;
    const code = isValidCurrency(currency) ? currency.toUpperCase() : exports.LEGACY_DEFAULT_CURRENCY;
    try {
        // Los decimales salen de la moneda (ARS/BRL/EUR/USD 2, JPY 0).
        return new Intl.NumberFormat(intlTag(locale), { style: "currency", currency: code }).format(n);
    }
    catch {
        return `${code} ${n.toFixed(2)}`;
    }
}
// ─────────────────────── Zona horaria: conversiones ───────────────────────
const pad2 = (n) => String(n).padStart(2, "0");
/** Componentes de calendario (año, mes 1-12, día, hora, minuto, segundo) de un instante en la zona dada. */
function zonedParts(value, timeZone) {
    const d = toValidDate(value);
    if (!d)
        return null;
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: resolveTimeZone(timeZone), hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(d);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}
/** Desfase de la zona respecto de UTC en minutos para ese instante (Buenos Aires → -180; Roma en verano → 120). */
function timeZoneOffsetMinutes(value, timeZone) {
    const d = toValidDate(value);
    const p = d && zonedParts(d, timeZone);
    if (!d || !p)
        return 0;
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
}
/**
 * Hora de pared en la zona → instante UTC. Acepta "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" o "YYYY-MM-DDTHH:mm:ss"
 * (el valor de un <input type="datetime-local">). En el hueco de un cambio de hora se adelanta; en la hora repetida
 * se toma la primera ocurrencia. Devuelve null si el texto no es válido.
 */
function zonedTimeToUtc(local, timeZone) {
    const m = typeof local === "string" ? /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(local.trim()) : null;
    if (!m)
        return null;
    const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59)
        return null;
    const wall = Date.UTC(y, mo - 1, d, h, mi, s);
    const check = new Date(wall);
    if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d)
        return null;
    const zone = resolveTimeZone(timeZone);
    // Dos candidatos (desfase antes/después de un posible cambio de hora); se elige el que reproduce la hora de pared.
    const o1 = timeZoneOffsetMinutes(wall - 86_400_000 / 2, zone);
    const o2 = timeZoneOffsetMinutes(wall + 86_400_000 / 2, zone);
    const candidates = [...new Set([o1, o2])].map((o) => wall - o * 60_000).sort((a, b) => a - b);
    for (const c of candidates)
        if (wall - timeZoneOffsetMinutes(c, zone) * 60_000 === c)
            return new Date(c);
    // Hueco (la hora no existe): se usa el desfase previo al cambio, lo que adelanta la hora.
    return new Date(wall - Math.min(o1, o2) * 60_000);
}
/** Instante → "YYYY-MM-DDTHH:mm" en la zona (valor para <input type="datetime-local">). "" si no es válido. */
function toZonedInputValue(value, timeZone) {
    const p = value === null || value === undefined ? null : zonedParts(value, timeZone);
    return p ? `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}` : "";
}
/** Fecha de calendario "YYYY-MM-DD" de un instante en la zona. "" si no es válido. */
function zonedDateKey(value, timeZone) {
    const p = zonedParts(value, timeZone);
    return p ? `${p.year}-${pad2(p.month)}-${pad2(p.day)}` : "";
}
/** Inicio (00:00) del día de calendario en la zona que contiene `value`, menos `daysAgo` días. */
function startOfDayInZone(value = new Date(), timeZone, daysAgo = 0) {
    const p = zonedParts(value, timeZone) ?? zonedParts(new Date(), timeZone);
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day - (Number.isFinite(daysAgo) ? Math.trunc(daysAgo) : 0)));
    const key = `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(day.getUTCDate())}`;
    return zonedTimeToUtc(key, timeZone);
}
/** Catálogos por idioma. Fuente: packages/shared/src/i18n/{es,en,pt,it}.json (es es la referencia de claves). */
exports.MESSAGES = { es: es_json_1.default, en: en_json_1.default, pt: pt_json_1.default, it: it_json_1.default };
// Paridad en compilación: cada catálogo debe tener todas las claves de es (el test i18n-locale verifica además que no sobren).
const _parity = { en: en_json_1.default, pt: pt_json_1.default, it: it_json_1.default };
void _parity;
/**
 * Traduce una clave con interpolación simple de {param}. Si falta en el idioma pedido, usa es;
 * si tampoco existe, devuelve la clave.
 */
function t(locale, key, params) {
    const l = resolveLocale(locale);
    const template = exports.MESSAGES[l][key] ?? exports.MESSAGES[exports.DEFAULT_LOCALE][key] ?? String(key);
    if (!params)
        return template;
    return template.replace(/\{(\w+)\}/g, (m, name) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m));
}
