import { z } from "zod";

/**
 * B5 — Herramientas parroquiales: esquemas, etiquetas y reglas compartidas por la API y la web. Cada módulo pertenece
 * a una parroquia y se protege con su permiso (PERMISSION_CATALOG en index.ts).
 */

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());
const optDate = z.preprocess((v) => (v === "" ? null : v), z.coerce.date().nullable().optional());
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/* ---------- Transmisiones (YouTube) ---------- */
export const LIVESTREAM_STATUS_LABEL = { SCHEDULED: "Programada", LIVE: "En vivo", ENDED: "Finalizada" } as const;
export const createLivestreamSchema = z.object({
  title: text(3, 120),
  /** Enlace del video o de la transmisión de YouTube (la API extrae y valida el id). */
  url: text(5, 300),
  eventId: z.string().uuid().nullable().optional(),
  scheduledAt: optDate,
}).strict();
export const updateLivestreamSchema = createLivestreamSchema.partial().strict();

/* ---------- Seguimiento GPS ---------- */
/** Una posición más vieja que esto se muestra como «sin señal». */
export const TRACKING_STALE_MS = 5 * 60_000;
/** Intervalo mínimo entre envíos del teléfono (la API también limita la frecuencia). */
export const TRACKING_MIN_INTERVAL_MS = 30_000;
export const locationPingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  /** Hora del dispositivo (ISO). No puede ser futura ni de hace más de 1 hora. */
  recordedAt: z.coerce.date(),
}).strict();
export const trackingSettingsSchema = z.object({ trackingEnabled: z.boolean() }).strict();

/* ---------- Agenda pastoral ---------- */
export const SCHEDULE_KINDS = ["MASS", "CONFESSION", "ADORATION", "CATECHESIS", "MEETING", "PATRONAL", "OTHER"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];
export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  MASS: "Misa", CONFESSION: "Confesiones", ADORATION: "Adoración eucarística", CATECHESIS: "Catequesis",
  MEETING: "Reunión", PATRONAL: "Celebración patronal", OTHER: "Actividad",
};
export const WEEKDAY_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
export const scheduleItemSchema = z.object({
  kind: z.enum(SCHEDULE_KINDS),
  title: text(2, 120),
  /** Cada semana (0 = domingo … 6 = sábado) o un día puntual (date). Exactamente uno de los dos. */
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  date: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  startTime: z.string().regex(HHMM, "Hora inválida (HH:MM)"),
  endTime: z.preprocess((v) => (v === "" ? null : v), z.string().regex(HHMM, "Hora inválida (HH:MM)").nullable().optional()),
  location: optText(160),
  notes: optText(500),
  active: z.boolean().optional(),
}).strict().refine((v) => (v.weekday == null) !== (v.date == null), { message: "Elige un día de la semana o una fecha", path: ["weekday"] })
  .refine((v) => !v.endTime || v.endTime > v.startTime, { message: "La hora de fin debe ser posterior al inicio", path: ["endTime"] });
export const organizationTimezoneSchema = z.object({ timezone: z.string().min(3).max(64) }).strict();

/* ---------- Donaciones (enlace externo de Mercado Pago) ---------- */
export const DONATION_PURPOSES = ["MAINTENANCE", "WORKS", "CHARITY", "SPECIAL", "OTHER"] as const;
export type DonationPurpose = (typeof DONATION_PURPOSES)[number];
export const DONATION_PURPOSE_LABEL: Record<DonationPurpose, string> = {
  MAINTENANCE: "Mantenimiento del templo", WORKS: "Obras parroquiales", CHARITY: "Acción solidaria / Cáritas", SPECIAL: "Campaña especial", OTHER: "Otra finalidad",
};
/** Dominios de Mercado Pago aceptados para enlaces de pago (https, sin usuario ni contraseña en la URL). */
const MP_HOST = /^(?:mpago\.la|mpago\.li|(?:www\.|link\.)?mercadopago\.com(?:\.(?:ar|br|mx|co|cl|pe|uy))?)$/i;
export function isAllowedDonationUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.password && !u.port && MP_HOST.test(u.hostname);
}
export const donationCampaignSchema = z.object({
  title: text(3, 100),
  purpose: z.enum(DONATION_PURPOSES),
  description: optText(1000),
  beneficiary: text(3, 160),
  url: z.string().trim().max(500).refine(isAllowedDonationUrl, "Usa un enlace de pago de Mercado Pago (https://mpago.la/… o https://link.mercadopago.com.ar/…)"),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
}).strict();

/* ---------- Boletín ---------- */
export const bulletinSchema = z.object({
  title: text(3, 120),
  weekOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  body: text(1, 8000),
  includeSchedule: z.boolean().optional(),
  includeEvents: z.boolean().optional(),
  includeCampaigns: z.boolean().optional(),
}).strict();
export const bulletinPublishSchema = z.object({ sendEmail: z.boolean().default(false) }).strict();
export const followPreferencesSchema = z.object({ bulletinEmail: z.boolean() }).strict();

/* ---------- Certificados sacramentales ---------- */
export const CERTIFICATE_TYPES = ["BAPTISM", "CONFIRMATION", "MARRIAGE"] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];
export const CERTIFICATE_TYPE_LABEL: Record<CertificateType, string> = { BAPTISM: "Bautismo", CONFIRMATION: "Confirmación", MARRIAGE: "Matrimonio" };
export const CERTIFICATE_STATUSES = ["RECEIVED", "IN_REVIEW", "NEEDS_INFO", "READY", "DELIVERED", "REJECTED"] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];
export const CERTIFICATE_STATUS_LABEL: Record<CertificateStatus, string> = {
  RECEIVED: "Recibida", IN_REVIEW: "En revisión", NEEDS_INFO: "Requiere información", READY: "Lista para entregar", DELIVERED: "Entregada", REJECTED: "Rechazada",
};
/** Transiciones permitidas (DELIVERED y REJECTED son finales). */
export const CERTIFICATE_TRANSITIONS: Record<CertificateStatus, readonly CertificateStatus[]> = {
  RECEIVED: ["IN_REVIEW", "NEEDS_INFO", "REJECTED"],
  IN_REVIEW: ["NEEDS_INFO", "READY", "REJECTED"],
  NEEDS_INFO: ["IN_REVIEW", "REJECTED"],
  READY: ["DELIVERED", "NEEDS_INFO"],
  DELIVERED: [],
  REJECTED: [],
};
export const certificateRequestSchema = z.object({
  type: z.enum(CERTIFICATE_TYPES),
  requesterName: text(3, 120),
  requesterEmail: z.string().trim().toLowerCase().email().max(200),
  requesterPhone: optText(40),
  requesterDocument: optText(30),
  subjectName: text(3, 160),
  subjectBirthDate: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  sacramentYear: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1800).max(2200).nullable().optional()),
  sacramentPlace: optText(160),
  parentsNames: optText(240),
  spouseName: optText(160),
  purpose: optText(240),
  details: optText(1500),
  /** Confirmación expresa del tratamiento de datos para esta solicitud. */
  acceptPrivacy: z.literal(true, { errorMap: () => ({ message: "Debes aceptar el uso de tus datos para esta solicitud" }) }),
  /** Trampa anti-spam: debe quedar vacío. */
  website: z.string().max(0).optional(),
}).strict();
export const certificateLookupSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^CERT-[A-Z0-9]{4}-[A-Z0-9]{4}$/, "Código inválido"),
  email: z.string().trim().toLowerCase().email().max(200),
}).strict();
export const certificateUpdateSchema = z.object({
  status: z.enum(CERTIFICATE_STATUSES),
  note: optText(1000),
  publicMessage: optText(1000),
  /** Entregar exige confirmar que se verificó la identidad y la autorización de quien retira. */
  identityVerified: z.boolean().optional(),
}).strict().refine((v) => v.status !== "DELIVERED" || v.identityVerified === true, {
  message: "Confirma que verificaste la identidad de quien retira el certificado", path: ["identityVerified"],
});

/* ---------- Inventario ---------- */
export const INVENTORY_CATEGORIES = ["FURNITURE", "IT", "SOUND", "INSTRUMENT", "CATECHESIS", "LITURGICAL", "OTHER"] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];
export const INVENTORY_CATEGORY_LABEL: Record<InventoryCategory, string> = {
  FURNITURE: "Mobiliario", IT: "Equipos informáticos", SOUND: "Sonido", INSTRUMENT: "Instrumentos", CATECHESIS: "Catequesis", LITURGICAL: "Litúrgico", OTHER: "Otros",
};
export const INVENTORY_CONDITIONS = ["NEW", "GOOD", "FAIR", "POOR", "BROKEN"] as const;
export type InventoryCondition = (typeof INVENTORY_CONDITIONS)[number];
export const INVENTORY_CONDITION_LABEL: Record<InventoryCondition, string> = { NEW: "Nuevo", GOOD: "Bueno", FAIR: "Regular", POOR: "Malo", BROKEN: "Fuera de servicio" };
export const inventoryItemSchema = z.object({
  name: text(2, 120),
  category: z.enum(INVENTORY_CATEGORIES),
  description: optText(1000),
  location: optText(160),
  condition: z.enum(INVENTORY_CONDITIONS).optional(),
  quantity: z.number().int().min(1).max(100_000).optional(),
  acquiredAt: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  responsible: optText(120),
  notes: optText(1000),
}).strict();
export const inventoryQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.enum(INVENTORY_CATEGORIES).optional(),
  condition: z.enum(INVENTORY_CONDITIONS).optional(),
  archived: z.enum(["true", "false"]).optional(),
});

/* ---------- Grupos pastorales y asistencia ---------- */
export const PASTORAL_GROUP_KINDS = ["CATECHESIS", "READERS", "MINISTERS", "VOLUNTEERS", "YOUTH", "LITURGY", "CHOIR", "OTHER"] as const;
export type PastoralGroupKind = (typeof PASTORAL_GROUP_KINDS)[number];
export const PASTORAL_GROUP_KIND_LABEL: Record<PastoralGroupKind, string> = {
  CATECHESIS: "Catequesis", READERS: "Lectores", MINISTERS: "Ministros", VOLUNTEERS: "Voluntarios", YOUTH: "Grupo juvenil", LITURGY: "Liturgia", CHOIR: "Coro", OTHER: "Otro",
};
export const pastoralGroupSchema = z.object({
  name: text(2, 120),
  kind: z.enum(PASTORAL_GROUP_KINDS),
  description: optText(1000),
  leaders: optText(240),
  active: z.boolean().optional(),
}).strict();
export const groupMemberSchema = z.object({
  name: text(2, 120),
  phone: optText(40),
  email: z.preprocess((v) => (v === "" ? null : v), z.string().trim().toLowerCase().email().max(200).nullable().optional()),
  role: optText(80),
  isMinor: z.boolean().optional(),
  guardianName: optText(120),
  guardianPhone: optText(40),
  active: z.boolean().optional(),
}).strict().refine((v) => !v.isMinor || !!v.guardianName, { message: "Para un menor indica el adulto responsable", path: ["guardianName"] });
export const groupMeetingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topic: optText(160),
  notes: optText(1000),
}).strict();
export const attendanceSchema = z.object({
  items: z.array(z.object({ memberId: z.string().uuid(), present: z.boolean() }).strict()).max(500),
}).strict();
