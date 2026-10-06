/**
 * Infraestructura de idiomas y formato (ARQUITECTURA-INTERNACIONAL §6). Se reexporta desde index.ts.
 *
 * - El idioma (`Locale`) es independiente del país: se guarda como código BCP-47 corto validado contra SUPPORTED_LOCALES.
 * - Para formatear con Intl se combina idioma + país (`formatLocale("es", "AR")` → "es-AR").
 * - Toda fecha/hora se formatea con una zona horaria explícita (la del evento u organización).
 * - Los montos siempre llevan su moneda explícita.
 */
import es from "./i18n/es.json";
import en from "./i18n/en.json";
import pt from "./i18n/pt.json";
import it from "./i18n/it.json";

// ───────────────────────────── Idiomas ─────────────────────────────

export const SUPPORTED_LOCALES = ["es", "en", "pt", "it"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

export const LOCALE_NAMES: Record<Locale, string> = { es: "Español", en: "English", pt: "Português", it: "Italiano" };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(v);

/** Idioma principal de una etiqueta BCP-47 ("pt-BR" → "pt"), o null si no está soportado. */
function primaryLocale(tag: string): Locale | null {
  const primary = tag.trim().split(/[-_]/)[0]?.toLowerCase();
  return isLocale(primary) ? primary : null;
}

/** Interpreta un encabezado Accept-Language ("pt-BR,pt;q=0.9,en;q=0.8") en etiquetas ordenadas por preferencia (q=0 se descarta). */
function parseAcceptLanguage(header: string): string[] {
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
export function resolveLocale(input?: string | null | readonly (string | null | undefined)[]): Locale {
  const candidates = Array.isArray(input) ? input : [input as string | null | undefined];
  for (const c of candidates) {
    if (!c) continue;
    for (const tag of parseAcceptLanguage(c)) {
      const l = primaryLocale(tag);
      if (l) return l;
    }
  }
  return DEFAULT_LOCALE;
}

/**
 * Etiqueta BCP-47 para Intl: idioma + país opcional (ISO 3166-1 alfa-2 o UN M49 numérico).
 * formatLocale("es", "AR") → "es-AR"; formatLocale("pt", "br") → "pt-BR"; formatLocale("it") → "it".
 */
export function formatLocale(locale?: string | null, country?: string | null): string {
  const l = resolveLocale(locale);
  const c = country?.trim();
  if (c && /^([A-Za-z]{2}|\d{3})$/.test(c)) return `${l}-${c.toUpperCase()}`;
  return l;
}

// ─────────────────────── Valores por defecto heredados ───────────────────────

/**
 * Zona horaria de respaldo. Los eventos y datos existentes la asumen (parroquia inicial en Argentina);
 * usar solo cuando el evento/organización no informa su propia zona.
 */
export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";
/** País de formato heredado: mantiene la salida "es-AR" mientras usuarios/organizaciones no tengan país/idioma propios. */
export const LEGACY_DEFAULT_COUNTRY = "AR";
/** Moneda heredada para montos que todavía no guardan su moneda (pendiente G6 `money_currency`). */
export const LEGACY_DEFAULT_CURRENCY = "ARS";
/** Etiqueta Intl heredada ("es-AR"). */
export const LEGACY_FORMAT_LOCALE = formatLocale(DEFAULT_LOCALE, LEGACY_DEFAULT_COUNTRY);

/** true si la zona IANA es válida en este entorno (incluye alias como America/Argentina/Buenos_Aires). */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Primera zona horaria válida entre los candidatos (p. ej. evento, organización), o DEFAULT_TIMEZONE. */
export function resolveTimeZone(...candidates: (string | null | undefined)[]): string {
  for (const z of candidates) if (isValidTimeZone(z)) return z;
  return DEFAULT_TIMEZONE;
}

// ───────────────────────────── Formato ─────────────────────────────

/**
 * Opciones de formato de fechas. Ambas son opcionales y toleran valores inválidos:
 * sin `locale` se usa LEGACY_FORMAT_LOCALE ("es-AR"); sin `timeZone` válida, DEFAULT_TIMEZONE.
 */
export interface FormatOptions {
  /** Etiqueta BCP-47 para Intl (ver formatLocale), p. ej. "es-AR" o "it". */
  locale?: string | null;
  /** Zona horaria IANA explícita, p. ej. la del evento (Event.timezone). */
  timeZone?: string | null;
}

export interface DateFormatOptions extends FormatOptions {
  /** Sin ceros a la izquierda ("6/10/2026"). Solo para el estilo numérico. */
  compact?: boolean;
  /** Mes abreviado con nombre ("6 oct 2026") en lugar de numérico. */
  monthName?: boolean;
  /** false omite el año (solo con monthName: "6 oct"). */
  year?: boolean;
}

export type DateInput = string | number | Date;

/** Texto que devuelven los formateadores cuando la entrada no es válida (nunca lanzan). */
export const INVALID_FORMAT = "—";

/** Etiqueta válida para Intl; si es inválida, vacía o no soportada por el entorno, cae a la heredada ("es-AR"). */
function intlTag(locale?: string | null): string {
  if (!locale || typeof locale !== "string") return LEGACY_FORMAT_LOCALE;
  try {
    const tag = Intl.getCanonicalLocales(locale)[0];
    return tag && Intl.DateTimeFormat.supportedLocalesOf(tag).length ? tag : LEGACY_FORMAT_LOCALE;
  } catch {
    return LEGACY_FORMAT_LOCALE;
  }
}

/** Convierte a Date; null si la entrada no representa un instante válido. */
export function toValidDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
}

/** Opciones de formato a partir de un evento (su zona horaria) y un idioma/etiqueta opcional. */
export function eventFormatOptions(event?: { timezone?: string | null } | null, locale?: string | null): Required<FormatOptions> {
  return { locale: intlTag(locale), timeZone: resolveTimeZone(event?.timezone) };
}

function safeFormat(value: DateInput, opts: FormatOptions | undefined, fmt: Intl.DateTimeFormatOptions): string {
  const d = toValidDate(value);
  if (!d) return INVALID_FORMAT;
  try {
    return new Intl.DateTimeFormat(intlTag(opts?.locale), { ...fmt, timeZone: resolveTimeZone(opts?.timeZone) }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** Hora en 24 h "HH:mm" en la zona indicada. */
export function formatTime(value: DateInput, opts?: FormatOptions): string {
  return safeFormat(value, opts, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/**
 * Fecha en el orden del idioma/país, en la zona indicada.
 * Numérica: es-AR "06/10/2026", en-US "10/06/2026"; `compact: true` → "6/10/2026".
 * `monthName: true` → "6 oct 2026" (es), "Oct 6, 2026" (en); con `year: false` → "6 oct".
 */
export function formatDate(value: DateInput, opts?: DateFormatOptions): string {
  if (opts?.monthName) {
    return safeFormat(value, opts, { day: "numeric", month: "short", ...(opts.year === false ? {} : { year: "numeric" as const }) });
  }
  const d = opts?.compact ? "numeric" : "2-digit";
  return safeFormat(value, opts, { day: d, month: d, year: "numeric" });
}

/** Fecha y hora: "06/10/2026 · 14:05" (el separador sale de los mensajes del idioma). */
export function formatDateTime(value: DateInput, opts?: DateFormatOptions): string {
  if (!toValidDate(value)) return INVALID_FORMAT;
  return t(resolveLocale(opts?.locale), "format.dateTime", { date: formatDate(value, opts), time: formatTime(value, opts) });
}

/** Número con separadores del idioma/país (es-AR "1.234"). Entrada no numérica → INVALID_FORMAT. */
export function formatNumber(value: number | string | null | undefined, locale?: string | null, options?: Intl.NumberFormatOptions): string {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return INVALID_FORMAT;
  try {
    return new Intl.NumberFormat(intlTag(locale), options).format(n);
  } catch {
    return new Intl.NumberFormat(intlTag(locale)).format(n);
  }
}

/** true si es un código ISO 4217 que Intl acepta. */
export function isValidCurrency(code: unknown): code is string {
  if (typeof code !== "string" || !/^[A-Za-z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

/**
 * Monto con moneda ISO 4217 explícita: formatMoney(1234.5, "ARS", "es-AR") → "$ 1.234,50".
 * Moneda inválida o ausente → LEGACY_DEFAULT_CURRENCY; monto no numérico → INVALID_FORMAT.
 */
export function formatMoney(amount: number | string | null | undefined, currency?: string | null, locale?: string | null): string {
  const n = typeof amount === "number" ? amount : typeof amount === "string" && amount.trim() !== "" ? Number(amount) : NaN;
  if (!Number.isFinite(n)) return INVALID_FORMAT;
  const code = isValidCurrency(currency) ? currency.toUpperCase() : LEGACY_DEFAULT_CURRENCY;
  try {
    // Los decimales salen de la moneda (ARS/BRL/EUR/USD 2, JPY 0).
    return new Intl.NumberFormat(intlTag(locale), { style: "currency", currency: code }).format(n);
  } catch {
    return `${code} ${n.toFixed(2)}`;
  }
}

// ─────────────────────── Zona horaria: conversiones ───────────────────────

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Componentes de calendario (año, mes 1-12, día, hora, minuto, segundo) de un instante en la zona dada. */
export function zonedParts(value: DateInput, timeZone?: string | null) {
  const d = toValidDate(value);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(timeZone), hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/** Desfase de la zona respecto de UTC en minutos para ese instante (Buenos Aires → -180; Roma en verano → 120). */
export function timeZoneOffsetMinutes(value: DateInput, timeZone?: string | null): number {
  const d = toValidDate(value);
  const p = d && zonedParts(d, timeZone);
  if (!d || !p) return 0;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
}

/**
 * Hora de pared en la zona → instante UTC. Acepta "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" o "YYYY-MM-DDTHH:mm:ss"
 * (el valor de un <input type="datetime-local">). En el hueco de un cambio de hora se adelanta; en la hora repetida
 * se toma la primera ocurrencia. Devuelve null si el texto no es válido.
 */
export function zonedTimeToUtc(local: string | null | undefined, timeZone?: string | null): Date | null {
  const m = typeof local === "string" ? /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(local.trim()) : null;
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(wall);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const zone = resolveTimeZone(timeZone);
  // Dos candidatos (desfase antes/después de un posible cambio de hora); se elige el que reproduce la hora de pared.
  const o1 = timeZoneOffsetMinutes(wall - 86_400_000 / 2, zone);
  const o2 = timeZoneOffsetMinutes(wall + 86_400_000 / 2, zone);
  const candidates = [...new Set([o1, o2])].map((o) => wall - o * 60_000).sort((a, b) => a - b);
  for (const c of candidates) if (wall - timeZoneOffsetMinutes(c, zone) * 60_000 === c) return new Date(c);
  // Hueco (la hora no existe): se usa el desfase previo al cambio, lo que adelanta la hora.
  return new Date(wall - Math.min(o1, o2) * 60_000);
}

/** Instante → "YYYY-MM-DDTHH:mm" en la zona (valor para <input type="datetime-local">). "" si no es válido. */
export function toZonedInputValue(value: DateInput | null | undefined, timeZone?: string | null): string {
  const p = value === null || value === undefined ? null : zonedParts(value, timeZone);
  return p ? `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}` : "";
}

/** Fecha de calendario "YYYY-MM-DD" de un instante en la zona. "" si no es válido. */
export function zonedDateKey(value: DateInput, timeZone?: string | null): string {
  const p = zonedParts(value, timeZone);
  return p ? `${p.year}-${pad2(p.month)}-${pad2(p.day)}` : "";
}

/** Inicio (00:00) del día de calendario en la zona que contiene `value`, menos `daysAgo` días. */
export function startOfDayInZone(value: DateInput = new Date(), timeZone?: string | null, daysAgo = 0): Date {
  const p = zonedParts(value, timeZone) ?? zonedParts(new Date(), timeZone)!;
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day - (Number.isFinite(daysAgo) ? Math.trunc(daysAgo) : 0)));
  const key = `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(day.getUTCDate())}`;
  return zonedTimeToUtc(key, timeZone)!;
}

// ───────────────────────────── Mensajes ─────────────────────────────

export type MessageKey = keyof typeof es;
export type Messages = Record<MessageKey, string>;

/** Catálogos por idioma. Fuente: packages/shared/src/i18n/{es,en,pt,it}.json (es es la referencia de claves). */
export const MESSAGES: Record<Locale, Partial<Messages>> = { es, en, pt, it };
// Paridad en compilación: cada catálogo debe tener todas las claves de es (el test i18n-locale verifica además que no sobren).
const _parity: Record<Exclude<Locale, "es">, Messages> = { en, pt, it };
void _parity;

/**
 * Traduce una clave con interpolación simple de {param}. Si falta en el idioma pedido, usa es;
 * si tampoco existe, devuelve la clave.
 */
export function t(locale: string | null | undefined, key: MessageKey, params?: Record<string, string | number>): string {
  const l = resolveLocale(locale);
  const template = MESSAGES[l][key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? String(key);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m));
}
