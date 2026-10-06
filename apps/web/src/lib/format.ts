import {
  LEGACY_DEFAULT_CURRENCY, LEGACY_FORMAT_LOCALE, formatDate, formatDateTime, formatMoney, formatNumber, formatTime, resolveTimeZone,
  startOfDayInZone, toZonedInputValue, zonedTimeToUtc,
} from "@peregrinos/shared";

export const pad = (n: number) => String(n).padStart(3, "0");

/**
 * Formato centralizado en @peregrinos/shared (Intl con idioma y zona explícitos).
 * `zone` es la zona del evento (Event.timezone; cae a DEFAULT_TIMEZONE); `locale` es una etiqueta BCP-47
 * (por defecto LEGACY_FORMAT_LOCALE, es-AR). Ningún formateador lanza: una fecha inválida se muestra "—".
 */
const tz = (z?: string | null) => resolveTimeZone(z);
const opts = (zone?: string | null, locale?: string) => ({ locale: locale || LEGACY_FORMAT_LOCALE, timeZone: tz(zone) });

export const fmtTime = (iso: string | Date, zone?: string | null, locale?: string) => formatTime(iso, opts(zone, locale));
export const fmtDate = (iso: string | Date, zone?: string | null, locale?: string) => formatDate(iso, opts(zone, locale));
/** Fecha sin ceros a la izquierda ("6/10/2026"). */
export const fmtDateCompact = (iso: string | Date, zone?: string | null, locale?: string) =>
  formatDate(iso, { ...opts(zone, locale), compact: true });
/** Fecha con mes abreviado ("6 oct 2026"). */
export const fmtDateMedium = (iso: string | Date, zone?: string | null, locale?: string) =>
  formatDate(iso, { ...opts(zone, locale), monthName: true });
export const fmtDateTime = (iso: string | Date, zone?: string | null, locale?: string) => formatDateTime(iso, opts(zone, locale));
/** Fecha con mes abreviado y hora ("6 oct 2026 · 14:05"); `year: false` → "6 oct · 14:05". */
export const fmtDateTimeMedium = (iso: string | Date, zone?: string | null, locale?: string, year = true) =>
  formatDateTime(iso, { ...opts(zone, locale), monthName: true, year });
export const fmtNumber = (n: number, locale?: string) => formatNumber(n, locale || LEGACY_FORMAT_LOCALE);

/** Documento con puntos: 28765432 -> 28.765.432 */
export const fmtDoc = (d: string) => (/^\d{6,}$/.test(d) ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : d);

const AVATAR = ["#18A957", "#1677FF", "#F29B18", "#7B3FE4", "#0E9AA7"];
export const avatarColor = (n: number) => AVATAR[(Math.max(1, n) - 1) % AVATAR.length];

/** Inicio del día en la zona del evento, como ISO (para filtrar "hoy"). Correcto también en días con cambio de hora. */
export function startOfDayISO(daysAgo = 0, zone?: string | null) {
  return startOfDayInZone(new Date(), zone, daysAgo).toISOString();
}

/**
 * Zona del dispositivo (para datos de la cuenta sin evento, p. ej. vencimientos de códigos).
 * Con zona inválida o sin Intl cae a DEFAULT_TIMEZONE.
 */
export function viewerTimeZone(): string {
  try {
    return resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return resolveTimeZone(null);
  }
}

/** ISO → valor de <input type="datetime-local"> en la zona del evento (no la del navegador). */
export const toZonedInput = (iso: string | null | undefined, zone?: string | null) => toZonedInputValue(iso, zone);
/** Valor de <input type="datetime-local"> interpretado en la zona del evento → ISO (null si está vacío o es inválido). */
export const fromZonedInput = (local: string, zone?: string | null) => zonedTimeToUtc(local, zone)?.toISOString() ?? null;

/** Monto con su moneda; mientras los montos no guarden moneda (G6), se asume la heredada (ARS). */
export const money = (v: string | number | null | undefined, currency: string = LEGACY_DEFAULT_CURRENCY, locale?: string) =>
  v === null || v === undefined || v === "" ? "—" : formatMoney(v, currency, locale || LEGACY_FORMAT_LOCALE);
