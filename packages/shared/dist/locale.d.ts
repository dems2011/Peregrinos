/**
 * Infraestructura de idiomas y formato (ARQUITECTURA-INTERNACIONAL §6). Se reexporta desde index.ts.
 *
 * - El idioma (`Locale`) es independiente del país: se guarda como código BCP-47 corto validado contra SUPPORTED_LOCALES.
 * - Para formatear con Intl se combina idioma + país (`formatLocale("es", "AR")` → "es-AR").
 * - Toda fecha/hora se formatea con una zona horaria explícita (la del evento u organización).
 * - Los montos siempre llevan su moneda explícita.
 */
import es from "./i18n/es.json";
export declare const SUPPORTED_LOCALES: readonly ["es", "en", "pt", "it"];
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export declare const DEFAULT_LOCALE: Locale;
export declare const LOCALE_NAMES: Record<Locale, string>;
export declare const isLocale: (v: unknown) => v is Locale;
/**
 * Resuelve el idioma a usar a partir de una etiqueta BCP-47 ("es-AR"), un encabezado Accept-Language
 * (con valores q) o una lista de candidatos en orden de preferencia (p. ej. [usuario, organización, navegador]).
 * Si nada coincide, devuelve DEFAULT_LOCALE.
 */
export declare function resolveLocale(input?: string | null | readonly (string | null | undefined)[]): Locale;
/**
 * Etiqueta BCP-47 para Intl: idioma + país opcional (ISO 3166-1 alfa-2 o UN M49 numérico).
 * formatLocale("es", "AR") → "es-AR"; formatLocale("pt", "br") → "pt-BR"; formatLocale("it") → "it".
 */
export declare function formatLocale(locale?: string | null, country?: string | null): string;
/**
 * Zona horaria de respaldo. Los eventos y datos existentes la asumen (parroquia inicial en Argentina);
 * usar solo cuando el evento/organización no informa su propia zona.
 */
export declare const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";
/** País de formato heredado: mantiene la salida "es-AR" mientras usuarios/organizaciones no tengan país/idioma propios. */
export declare const LEGACY_DEFAULT_COUNTRY = "AR";
/** Moneda heredada para montos que todavía no guardan su moneda (pendiente G6 `money_currency`). */
export declare const LEGACY_DEFAULT_CURRENCY = "ARS";
/** Etiqueta Intl heredada ("es-AR"). */
export declare const LEGACY_FORMAT_LOCALE: string;
/** true si la zona IANA es válida en este entorno (incluye alias como America/Argentina/Buenos_Aires). */
export declare function isValidTimeZone(zone: unknown): zone is string;
/** Primera zona horaria válida entre los candidatos (p. ej. evento, organización), o DEFAULT_TIMEZONE. */
export declare function resolveTimeZone(...candidates: (string | null | undefined)[]): string;
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
export declare const INVALID_FORMAT = "\u2014";
/** Convierte a Date; null si la entrada no representa un instante válido. */
export declare function toValidDate(v: unknown): Date | null;
/** Opciones de formato a partir de un evento (su zona horaria) y un idioma/etiqueta opcional. */
export declare function eventFormatOptions(event?: {
    timezone?: string | null;
} | null, locale?: string | null): Required<FormatOptions>;
/** Hora en 24 h "HH:mm" en la zona indicada. */
export declare function formatTime(value: DateInput, opts?: FormatOptions): string;
/**
 * Fecha en el orden del idioma/país, en la zona indicada.
 * Numérica: es-AR "06/10/2026", en-US "10/06/2026"; `compact: true` → "6/10/2026".
 * `monthName: true` → "6 oct 2026" (es), "Oct 6, 2026" (en); con `year: false` → "6 oct".
 */
export declare function formatDate(value: DateInput, opts?: DateFormatOptions): string;
/** Fecha y hora: "06/10/2026 · 14:05" (el separador sale de los mensajes del idioma). */
export declare function formatDateTime(value: DateInput, opts?: DateFormatOptions): string;
/** Número con separadores del idioma/país (es-AR "1.234"). Entrada no numérica → INVALID_FORMAT. */
export declare function formatNumber(value: number | string | null | undefined, locale?: string | null, options?: Intl.NumberFormatOptions): string;
/** true si es un código ISO 4217 que Intl acepta. */
export declare function isValidCurrency(code: unknown): code is string;
/**
 * Monto con moneda ISO 4217 explícita: formatMoney(1234.5, "ARS", "es-AR") → "$ 1.234,50".
 * Moneda inválida o ausente → LEGACY_DEFAULT_CURRENCY; monto no numérico → INVALID_FORMAT.
 */
export declare function formatMoney(amount: number | string | null | undefined, currency?: string | null, locale?: string | null): string;
/** Componentes de calendario (año, mes 1-12, día, hora, minuto, segundo) de un instante en la zona dada. */
export declare function zonedParts(value: DateInput, timeZone?: string | null): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
} | null;
/** Desfase de la zona respecto de UTC en minutos para ese instante (Buenos Aires → -180; Roma en verano → 120). */
export declare function timeZoneOffsetMinutes(value: DateInput, timeZone?: string | null): number;
/**
 * Hora de pared en la zona → instante UTC. Acepta "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" o "YYYY-MM-DDTHH:mm:ss"
 * (el valor de un <input type="datetime-local">). En el hueco de un cambio de hora se adelanta; en la hora repetida
 * se toma la primera ocurrencia. Devuelve null si el texto no es válido.
 */
export declare function zonedTimeToUtc(local: string | null | undefined, timeZone?: string | null): Date | null;
/** Instante → "YYYY-MM-DDTHH:mm" en la zona (valor para <input type="datetime-local">). "" si no es válido. */
export declare function toZonedInputValue(value: DateInput | null | undefined, timeZone?: string | null): string;
/** Fecha de calendario "YYYY-MM-DD" de un instante en la zona. "" si no es válido. */
export declare function zonedDateKey(value: DateInput, timeZone?: string | null): string;
/** Inicio (00:00) del día de calendario en la zona que contiene `value`, menos `daysAgo` días. */
export declare function startOfDayInZone(value?: DateInput, timeZone?: string | null, daysAgo?: number): Date;
export type MessageKey = keyof typeof es;
export type Messages = Record<MessageKey, string>;
/** Catálogos por idioma. Fuente: packages/shared/src/i18n/{es,en,pt,it}.json (es es la referencia de claves). */
export declare const MESSAGES: Record<Locale, Partial<Messages>>;
/**
 * Traduce una clave con interpolación simple de {param}. Si falta en el idioma pedido, usa es;
 * si tampoco existe, devuelve la clave.
 */
export declare function t(locale: string | null | undefined, key: MessageKey, params?: Record<string, string | number>): string;
