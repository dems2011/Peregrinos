"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceSchema = exports.groupMeetingSchema = exports.groupMemberSchema = exports.pastoralGroupSchema = exports.PASTORAL_GROUP_KIND_LABEL = exports.PASTORAL_GROUP_KINDS = exports.inventoryQuerySchema = exports.inventoryItemSchema = exports.INVENTORY_CONDITION_LABEL = exports.INVENTORY_CONDITIONS = exports.INVENTORY_CATEGORY_LABEL = exports.INVENTORY_CATEGORIES = exports.certificateUpdateSchema = exports.certificateLookupSchema = exports.certificateRequestSchema = exports.CERTIFICATE_TRANSITIONS = exports.CERTIFICATE_STATUS_LABEL = exports.CERTIFICATE_STATUSES = exports.CERTIFICATE_TYPE_LABEL = exports.CERTIFICATE_TYPES = exports.followPreferencesSchema = exports.bulletinPublishSchema = exports.bulletinSchema = exports.donationCampaignSchema = exports.DONATION_PURPOSE_LABEL = exports.DONATION_PURPOSES = exports.organizationTimezoneSchema = exports.scheduleItemSchema = exports.WEEKDAY_LABEL = exports.SCHEDULE_KIND_LABEL = exports.SCHEDULE_KINDS = exports.trackingSettingsSchema = exports.locationPingSchema = exports.TRACKING_MIN_INTERVAL_MS = exports.TRACKING_STALE_MS = exports.updateLivestreamSchema = exports.createLivestreamSchema = exports.LIVESTREAM_STATUS_LABEL = void 0;
exports.isAllowedDonationUrl = isAllowedDonationUrl;
const zod_1 = require("zod");
/**
 * B5 — Herramientas parroquiales: esquemas, etiquetas y reglas compartidas por la API y la web. Cada módulo pertenece
 * a una parroquia y se protege con su permiso (PERMISSION_CATALOG en index.ts).
 */
const text = (min, max) => zod_1.z.string().trim().min(min).max(max);
const optText = (max) => zod_1.z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), zod_1.z.string().trim().max(max).nullable().optional());
const optDate = zod_1.z.preprocess((v) => (v === "" ? null : v), zod_1.z.coerce.date().nullable().optional());
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
/* ---------- Transmisiones (YouTube) ---------- */
exports.LIVESTREAM_STATUS_LABEL = { SCHEDULED: "Programada", LIVE: "En vivo", ENDED: "Finalizada" };
exports.createLivestreamSchema = zod_1.z.object({
    title: text(3, 120),
    /** Enlace del video o de la transmisión de YouTube (la API extrae y valida el id). */
    url: text(5, 300),
    eventId: zod_1.z.string().uuid().nullable().optional(),
    scheduledAt: optDate,
}).strict();
exports.updateLivestreamSchema = exports.createLivestreamSchema.partial().strict();
/* ---------- Seguimiento GPS ---------- */
/** Una posición más vieja que esto se muestra como «sin señal». */
exports.TRACKING_STALE_MS = 5 * 60_000;
/** Intervalo mínimo entre envíos del teléfono (la API también limita la frecuencia). */
exports.TRACKING_MIN_INTERVAL_MS = 30_000;
exports.locationPingSchema = zod_1.z.object({
    latitude: zod_1.z.number().min(-90).max(90),
    longitude: zod_1.z.number().min(-180).max(180),
    accuracy: zod_1.z.number().min(0).max(100_000).nullable().optional(),
    /** Hora del dispositivo (ISO). No puede ser futura ni de hace más de 1 hora. */
    recordedAt: zod_1.z.coerce.date(),
}).strict();
exports.trackingSettingsSchema = zod_1.z.object({ trackingEnabled: zod_1.z.boolean() }).strict();
/* ---------- Agenda pastoral ---------- */
exports.SCHEDULE_KINDS = ["MASS", "CONFESSION", "ADORATION", "CATECHESIS", "MEETING", "PATRONAL", "OTHER"];
exports.SCHEDULE_KIND_LABEL = {
    MASS: "Misa", CONFESSION: "Confesiones", ADORATION: "Adoración eucarística", CATECHESIS: "Catequesis",
    MEETING: "Reunión", PATRONAL: "Celebración patronal", OTHER: "Actividad",
};
exports.WEEKDAY_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
exports.scheduleItemSchema = zod_1.z.object({
    kind: zod_1.z.enum(exports.SCHEDULE_KINDS),
    title: text(2, 120),
    /** Cada semana (0 = domingo … 6 = sábado) o un día puntual (date). Exactamente uno de los dos. */
    weekday: zod_1.z.number().int().min(0).max(6).nullable().optional(),
    date: zod_1.z.preprocess((v) => (v === "" ? null : v), zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
    startTime: zod_1.z.string().regex(HHMM, "Hora inválida (HH:MM)"),
    endTime: zod_1.z.preprocess((v) => (v === "" ? null : v), zod_1.z.string().regex(HHMM, "Hora inválida (HH:MM)").nullable().optional()),
    location: optText(160),
    notes: optText(500),
    active: zod_1.z.boolean().optional(),
}).strict().refine((v) => (v.weekday == null) !== (v.date == null), { message: "Elige un día de la semana o una fecha", path: ["weekday"] })
    .refine((v) => !v.endTime || v.endTime > v.startTime, { message: "La hora de fin debe ser posterior al inicio", path: ["endTime"] });
exports.organizationTimezoneSchema = zod_1.z.object({ timezone: zod_1.z.string().min(3).max(64) }).strict();
/* ---------- Donaciones (enlace externo de Mercado Pago) ---------- */
exports.DONATION_PURPOSES = ["MAINTENANCE", "WORKS", "CHARITY", "SPECIAL", "OTHER"];
exports.DONATION_PURPOSE_LABEL = {
    MAINTENANCE: "Mantenimiento del templo", WORKS: "Obras parroquiales", CHARITY: "Acción solidaria / Cáritas", SPECIAL: "Campaña especial", OTHER: "Otra finalidad",
};
/** Dominios de Mercado Pago aceptados para enlaces de pago (https, sin usuario ni contraseña en la URL). */
const MP_HOST = /^(?:mpago\.la|mpago\.li|(?:www\.|link\.)?mercadopago\.com(?:\.(?:ar|br|mx|co|cl|pe|uy))?)$/i;
function isAllowedDonationUrl(raw) {
    let u;
    try {
        u = new URL(raw.trim());
    }
    catch {
        return false;
    }
    return u.protocol === "https:" && !u.username && !u.password && !u.port && MP_HOST.test(u.hostname);
}
exports.donationCampaignSchema = zod_1.z.object({
    title: text(3, 100),
    purpose: zod_1.z.enum(exports.DONATION_PURPOSES),
    description: optText(1000),
    beneficiary: text(3, 160),
    url: zod_1.z.string().trim().max(500).refine(isAllowedDonationUrl, "Usa un enlace de pago de Mercado Pago (https://mpago.la/… o https://link.mercadopago.com.ar/…)"),
    active: zod_1.z.boolean().optional(),
    sortOrder: zod_1.z.number().int().min(0).max(999).optional(),
}).strict();
/* ---------- Boletín ---------- */
exports.bulletinSchema = zod_1.z.object({
    title: text(3, 120),
    weekOf: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    body: text(1, 8000),
    includeSchedule: zod_1.z.boolean().optional(),
    includeEvents: zod_1.z.boolean().optional(),
    includeCampaigns: zod_1.z.boolean().optional(),
}).strict();
exports.bulletinPublishSchema = zod_1.z.object({ sendEmail: zod_1.z.boolean().default(false) }).strict();
exports.followPreferencesSchema = zod_1.z.object({ bulletinEmail: zod_1.z.boolean() }).strict();
/* ---------- Certificados sacramentales ---------- */
exports.CERTIFICATE_TYPES = ["BAPTISM", "CONFIRMATION", "MARRIAGE"];
exports.CERTIFICATE_TYPE_LABEL = { BAPTISM: "Bautismo", CONFIRMATION: "Confirmación", MARRIAGE: "Matrimonio" };
exports.CERTIFICATE_STATUSES = ["RECEIVED", "IN_REVIEW", "NEEDS_INFO", "READY", "DELIVERED", "REJECTED"];
exports.CERTIFICATE_STATUS_LABEL = {
    RECEIVED: "Recibida", IN_REVIEW: "En revisión", NEEDS_INFO: "Requiere información", READY: "Lista para entregar", DELIVERED: "Entregada", REJECTED: "Rechazada",
};
/** Transiciones permitidas (DELIVERED y REJECTED son finales). */
exports.CERTIFICATE_TRANSITIONS = {
    RECEIVED: ["IN_REVIEW", "NEEDS_INFO", "REJECTED"],
    IN_REVIEW: ["NEEDS_INFO", "READY", "REJECTED"],
    NEEDS_INFO: ["IN_REVIEW", "REJECTED"],
    READY: ["DELIVERED", "NEEDS_INFO"],
    DELIVERED: [],
    REJECTED: [],
};
exports.certificateRequestSchema = zod_1.z.object({
    type: zod_1.z.enum(exports.CERTIFICATE_TYPES),
    requesterName: text(3, 120),
    requesterEmail: zod_1.z.string().trim().toLowerCase().email().max(200),
    requesterPhone: optText(40),
    requesterDocument: optText(30),
    subjectName: text(3, 160),
    subjectBirthDate: zod_1.z.preprocess((v) => (v === "" ? null : v), zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
    sacramentYear: zod_1.z.preprocess((v) => (v === "" || v == null ? null : Number(v)), zod_1.z.number().int().min(1800).max(2200).nullable().optional()),
    sacramentPlace: optText(160),
    parentsNames: optText(240),
    spouseName: optText(160),
    purpose: optText(240),
    details: optText(1500),
    /** Confirmación expresa del tratamiento de datos para esta solicitud. */
    acceptPrivacy: zod_1.z.literal(true, { errorMap: () => ({ message: "Debes aceptar el uso de tus datos para esta solicitud" }) }),
    /** Trampa anti-spam: debe quedar vacío. */
    website: zod_1.z.string().max(0).optional(),
}).strict();
exports.certificateLookupSchema = zod_1.z.object({
    code: zod_1.z.string().trim().toUpperCase().regex(/^CERT-[A-Z0-9]{4}-[A-Z0-9]{4}$/, "Código inválido"),
    email: zod_1.z.string().trim().toLowerCase().email().max(200),
}).strict();
exports.certificateUpdateSchema = zod_1.z.object({
    status: zod_1.z.enum(exports.CERTIFICATE_STATUSES),
    note: optText(1000),
    publicMessage: optText(1000),
    /** Entregar exige confirmar que se verificó la identidad y la autorización de quien retira. */
    identityVerified: zod_1.z.boolean().optional(),
}).strict().refine((v) => v.status !== "DELIVERED" || v.identityVerified === true, {
    message: "Confirma que verificaste la identidad de quien retira el certificado", path: ["identityVerified"],
});
/* ---------- Inventario ---------- */
exports.INVENTORY_CATEGORIES = ["FURNITURE", "IT", "SOUND", "INSTRUMENT", "CATECHESIS", "LITURGICAL", "OTHER"];
exports.INVENTORY_CATEGORY_LABEL = {
    FURNITURE: "Mobiliario", IT: "Equipos informáticos", SOUND: "Sonido", INSTRUMENT: "Instrumentos", CATECHESIS: "Catequesis", LITURGICAL: "Litúrgico", OTHER: "Otros",
};
exports.INVENTORY_CONDITIONS = ["NEW", "GOOD", "FAIR", "POOR", "BROKEN"];
exports.INVENTORY_CONDITION_LABEL = { NEW: "Nuevo", GOOD: "Bueno", FAIR: "Regular", POOR: "Malo", BROKEN: "Fuera de servicio" };
exports.inventoryItemSchema = zod_1.z.object({
    name: text(2, 120),
    category: zod_1.z.enum(exports.INVENTORY_CATEGORIES),
    description: optText(1000),
    location: optText(160),
    condition: zod_1.z.enum(exports.INVENTORY_CONDITIONS).optional(),
    quantity: zod_1.z.number().int().min(1).max(100_000).optional(),
    acquiredAt: zod_1.z.preprocess((v) => (v === "" ? null : v), zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
    responsible: optText(120),
    notes: optText(1000),
}).strict();
exports.inventoryQuerySchema = zod_1.z.object({
    q: zod_1.z.string().trim().max(80).optional(),
    category: zod_1.z.enum(exports.INVENTORY_CATEGORIES).optional(),
    condition: zod_1.z.enum(exports.INVENTORY_CONDITIONS).optional(),
    archived: zod_1.z.enum(["true", "false"]).optional(),
});
/* ---------- Grupos pastorales y asistencia ---------- */
exports.PASTORAL_GROUP_KINDS = ["CATECHESIS", "READERS", "MINISTERS", "VOLUNTEERS", "YOUTH", "LITURGY", "CHOIR", "OTHER"];
exports.PASTORAL_GROUP_KIND_LABEL = {
    CATECHESIS: "Catequesis", READERS: "Lectores", MINISTERS: "Ministros", VOLUNTEERS: "Voluntarios", YOUTH: "Grupo juvenil", LITURGY: "Liturgia", CHOIR: "Coro", OTHER: "Otro",
};
exports.pastoralGroupSchema = zod_1.z.object({
    name: text(2, 120),
    kind: zod_1.z.enum(exports.PASTORAL_GROUP_KINDS),
    description: optText(1000),
    leaders: optText(240),
    active: zod_1.z.boolean().optional(),
}).strict();
exports.groupMemberSchema = zod_1.z.object({
    name: text(2, 120),
    phone: optText(40),
    email: zod_1.z.preprocess((v) => (v === "" ? null : v), zod_1.z.string().trim().toLowerCase().email().max(200).nullable().optional()),
    role: optText(80),
    isMinor: zod_1.z.boolean().optional(),
    guardianName: optText(120),
    guardianPhone: optText(40),
    active: zod_1.z.boolean().optional(),
}).strict().refine((v) => !v.isMinor || !!v.guardianName, { message: "Para un menor indica el adulto responsable", path: ["guardianName"] });
exports.groupMeetingSchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    topic: optText(160),
    notes: optText(1000),
}).strict();
exports.attendanceSchema = zod_1.z.object({
    items: zod_1.z.array(zod_1.z.object({ memberId: zod_1.z.string().uuid(), present: zod_1.z.boolean() }).strict()).max(500),
}).strict();
