export const pad = (n: number) => String(n).padStart(3, "0");

const tz = (z?: string) => z || "America/Argentina/Buenos_Aires";
export const fmtTime = (iso: string | Date, zone?: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz(zone) });
export const fmtDate = (iso: string | Date, zone?: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz(zone) });
export const fmtDateTime = (iso: string | Date, zone?: string) => `${fmtDate(iso, zone)} · ${fmtTime(iso, zone)}`;

/** Documento con puntos: 28765432 -> 28.765.432 */
export const fmtDoc = (d: string) => (/^\d{6,}$/.test(d) ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : d);

const AVATAR = ["#18A957", "#1677FF", "#F29B18", "#7B3FE4", "#0E9AA7"];
export const avatarColor = (n: number) => AVATAR[(Math.max(1, n) - 1) % AVATAR.length];

/** Inicio del día en la zona del evento, como ISO (para filtrar "hoy"). */
export function startOfDayISO(daysAgo = 0, zone?: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz(zone), year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const base = new Date(`${parts}T00:00:00`);
  // Ajuste por el desfase de la zona respecto al navegador
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz(zone) }));
  const offset = now.getTime() - local.getTime();
  return new Date(base.getTime() + offset - daysAgo * 86_400_000).toISOString();
}

export const money = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(Number(v));
