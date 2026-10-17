"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sigypNoticeSchema = exports.multiNoticeSchema = exports.noticeAudiencesSchema = exports.NOTICE_AUDIENCE_LABEL = exports.NOTICE_AUDIENCES = exports.sigypEventWithdrawSchema = exports.sigypEventSchema = exports.SIGYP_ATTENDANCE_MODES = exports.sigypLinkCompleteSchema = exports.sigypLinkPreviewSchema = exports.LINK_CODE_ALPHABET = exports.LINK_CODE_TTL_MINUTES = exports.sigypProfileSchema = exports.SIGYP_PROFILE_FIELDS = exports.sigypWithdrawSchema = exports.sigypAnnouncementSchema = exports.SIGYP_CATEGORY_LABEL = exports.SIGYP_CATEGORIES = exports.SIGYP_SCOPES = exports.SIGYP_CONTRACT_VERSION = exports.SIGYP_EVENT_TYPES = void 0;
exports.isAnnouncementVisible = isAnnouncementVisible;
exports.sigypManagedFieldsIn = sigypManagedFieldsIn;
exports.normalizeLinkCode = normalizeLinkCode;
exports.formatLinkCode = formatLinkCode;
exports.uniqueRecipients = uniqueRecipients;
const zod_1 = require("zod");
/** Tipos de evento admitidos desde SIGyP: copia de EVENT_TYPES (index.ts) para no crear una dependencia circular;
 *  una prueba (s1) verifica que sean idénticos. */
exports.SIGYP_EVENT_TYPES = [
    "PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY",
    "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER",
];
/**
 * Integración con SIGyP — Gestión Parroquial (contrato v1, ver docs/INTEGRACION-SIGYP.md). SIGyP es la fuente de verdad
 * de la cartelera y de los campos públicos del perfil que publica; Peregrinos los recibe por un canal autenticado con
 * una credencial POR ORGANIZACIÓN (la organización sale de la credencial, nunca del contenido). Cada elemento trae una
 * versión creciente: una versión no mayor que la guardada se ignora (reintentar nunca duplica ni retrocede).
 */
exports.SIGYP_CONTRACT_VERSION = 1;
exports.SIGYP_SCOPES = ["announcements:write", "profile:write", "events:write", "notices:send"];
exports.SIGYP_CATEGORIES = ["GENERAL", "LITURGIA", "SACRAMENTOS", "CATEQUESIS", "CARIDAD", "ACTIVIDADES", "SECRETARIA"];
exports.SIGYP_CATEGORY_LABEL = {
    GENERAL: "General", LITURGIA: "Liturgia y celebraciones", SACRAMENTOS: "Sacramentos", CATEQUESIS: "Catequesis",
    CARIDAD: "Caridad y servicio", ACTIVIDADES: "Actividades", SECRETARIA: "Secretaría parroquial",
};
const iso = zod_1.z.string().datetime({ offset: true });
exports.sigypAnnouncementSchema = zod_1.z.object({
    contract: zod_1.z.literal(1),
    sourceId: zod_1.z.string().uuid(),
    version: zod_1.z.number().int().min(1).max(1_000_000),
    title: zod_1.z.string().trim().min(3).max(150),
    body: zod_1.z.string().trim().min(3).max(5000),
    category: zod_1.z.enum(exports.SIGYP_CATEGORIES),
    startsAt: iso,
    endsAt: iso.nullable(),
    publishedAt: iso,
}).strict().refine((a) => a.endsAt === null || new Date(a.endsAt).getTime() > new Date(a.startsAt).getTime(), {
    message: "endsAt debe ser posterior a startsAt", path: ["endsAt"],
});
exports.sigypWithdrawSchema = zod_1.z.object({
    contract: zod_1.z.literal(1),
    sourceId: zod_1.z.string().uuid(),
    version: zod_1.z.number().int().min(1).max(1_000_000),
}).strict();
/** Los nueve campos públicos que SIGyP administra (siempre presentes; null = vacío). Mismos límites que el perfil. */
exports.SIGYP_PROFILE_FIELDS = ["description", "address", "phone", "email", "website", "instagram", "facebook", "youtube", "officeHours"];
const opt = (max) => zod_1.z.string().trim().max(max).nullable();
exports.sigypProfileSchema = zod_1.z.object({
    contract: zod_1.z.literal(1),
    version: zod_1.z.number().int().min(1).max(1_000_000),
    profile: zod_1.z.object({
        description: opt(2000),
        address: opt(240),
        phone: opt(40),
        email: zod_1.z.string().trim().toLowerCase().email().max(200).nullable(),
        website: zod_1.z.string().trim().url().max(300).refine((u) => u.startsWith("https://"), "Debe ser https").nullable(),
        instagram: opt(200),
        facebook: opt(200),
        youtube: opt(200),
        officeHours: opt(1000),
    }).strict(),
}).strict();
/** ¿Se muestra al público ahora? No retirado, ya comenzó y no venció (endsAt exclusivo; sin endsAt no vence). */
function isAnnouncementVisible(a, now = new Date()) {
    if (a.withdrawnAt)
        return false;
    const t = now.getTime();
    if (new Date(a.startsAt).getTime() > t)
        return false;
    return a.endsAt === null || new Date(a.endsAt).getTime() > t;
}
/** Campos del perfil que dejan de editarse en Peregrinos mientras la organización recibe el perfil desde SIGyP. */
function sigypManagedFieldsIn(body) {
    return Object.keys(body).filter((k) => exports.SIGYP_PROFILE_FIELDS.includes(k));
}
/* -------- Vinculación con código de un solo uso (lo genera el SUPERADMIN en Peregrinos) -------- */
/** «PGV-» + 4 grupos de 5 caracteres base32 sin ambiguos (≈100 bits). Se compara sin guiones ni mayúsculas. */
const LINK_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
exports.LINK_CODE_TTL_MINUTES = 15;
function normalizeLinkCode(raw) {
    const c = raw.trim().toUpperCase().replace(/[\s-]/g, "");
    if (!c.startsWith("PGV") || c.length !== 23)
        return null;
    const body = c.slice(3);
    return [...body].every((ch) => LINK_ALPHABET.includes(ch)) ? c : null;
}
function formatLinkCode(body20) {
    return `PGV-${body20.match(/.{5}/g).join("-")}`;
}
exports.LINK_CODE_ALPHABET = LINK_ALPHABET;
exports.sigypLinkPreviewSchema = zod_1.z.object({ code: zod_1.z.string().trim().min(10).max(40) }).strict();
exports.sigypLinkCompleteSchema = zod_1.z.object({
    code: zod_1.z.string().trim().min(10).max(40),
    /** Instalación de SIGyP que se vincula (para identificar la credencial; no concede nada). */
    installation: zod_1.z.object({ parishCode: zod_1.z.string().trim().min(2).max(40), label: zod_1.z.string().trim().min(3).max(80) }).strict(),
}).strict();
/* -------- Eventos publicados desde SIGyP (usan el modelo Event de Peregrinos) -------- */
exports.SIGYP_ATTENDANCE_MODES = ["IN_PERSON", "ONLINE", "HYBRID"];
const https = zod_1.z.string().trim().url().max(300).refine((u) => u.startsWith("https://"), "Debe ser https");
exports.sigypEventSchema = zod_1.z.object({
    contract: zod_1.z.literal(1),
    sourceId: zod_1.z.string().uuid(),
    version: zod_1.z.number().int().min(1).max(1_000_000),
    title: zod_1.z.string().trim().min(3).max(160),
    description: zod_1.z.string().trim().max(5000).nullable(),
    eventType: zod_1.z.enum(exports.SIGYP_EVENT_TYPES),
    startsAt: iso,
    endsAt: iso.nullable(),
    timezone: zod_1.z.string().trim().min(3).max(64).regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$|^UTC$/),
    locationName: zod_1.z.string().trim().max(160).nullable(),
    address: zod_1.z.string().trim().max(240).nullable(),
    attendanceMode: zod_1.z.enum(exports.SIGYP_ATTENDANCE_MODES),
    onlineUrl: https.nullable(),
    visibility: zod_1.z.enum(["PUBLIC", "UNLISTED"]),
}).strict()
    .refine((e) => e.endsAt === null || new Date(e.endsAt).getTime() > new Date(e.startsAt).getTime(), { message: "endsAt debe ser posterior a startsAt", path: ["endsAt"] })
    .refine((e) => e.attendanceMode === "IN_PERSON" || e.onlineUrl !== null, { message: "Un evento virtual o mixto necesita el enlace de participación", path: ["onlineUrl"] })
    .refine((e) => e.attendanceMode === "ONLINE" || e.locationName !== null || e.address !== null, { message: "Un evento presencial o mixto necesita lugar o dirección", path: ["locationName"] });
exports.sigypEventWithdrawSchema = exports.sigypWithdrawSchema;
/* -------- Avisos multigrupo (lógica de destinatarios compartida) -------- */
/** Grupos de destinatarios en Peregrinos. Se derivan de datos reales: seguidores y personal según su rol. */
exports.NOTICE_AUDIENCES = ["FOLLOWERS", "STAFF:SUPERADMIN", "STAFF:ADMIN", "STAFF:OPERATOR"];
exports.NOTICE_AUDIENCE_LABEL = {
    FOLLOWERS: "Seguidores de la parroquia", "STAFF:SUPERADMIN": "Administración: titular", "STAFF:ADMIN": "Administración: administradores",
    "STAFF:OPERATOR": "Personal operativo",
};
exports.noticeAudiencesSchema = zod_1.z.array(zod_1.z.enum(exports.NOTICE_AUDIENCES)).min(1).max(exports.NOTICE_AUDIENCES.length)
    .refine((a) => new Set(a).size === a.length, "Grupos repetidos");
exports.multiNoticeSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(3, "Escribe un título").max(120),
    body: zod_1.z.string().trim().min(3, "Escribe el mensaje").max(2000),
    audiences: exports.noticeAudiencesSchema,
    delivery: zod_1.z.enum(["PUSH", "INBOX"]).default("PUSH"),
    eventId: zod_1.z.string().uuid().nullable().optional(),
    urgent: zod_1.z.boolean().default(false),
    /** Alerta urgente: motivo obligatorio (queda en la auditoría). */
    urgentReason: zod_1.z.string().trim().min(10).max(300).nullable().optional(),
    /** Confirmación explícita del resumen de destinatarios mostrado antes de enviar. */
    confirmedRecipients: zod_1.z.number().int().min(0),
}).strict().refine((n) => !n.urgent || !!n.urgentReason, { message: "Una alerta urgente necesita un motivo", path: ["urgentReason"] })
    .refine((n) => !n.urgent || n.delivery === "PUSH", { message: "Una alerta urgente se envía como push", path: ["delivery"] });
exports.sigypNoticeSchema = zod_1.z.object({
    contract: zod_1.z.literal(1),
    sourceId: zod_1.z.string().uuid(),
    title: zod_1.z.string().trim().min(3).max(120),
    body: zod_1.z.string().trim().min(3).max(2000),
    audiences: exports.noticeAudiencesSchema,
    delivery: zod_1.z.enum(["PUSH", "INBOX"]),
}).strict();
/** Destinatarios únicos de varios grupos: una persona en dos grupos recibe UN aviso. */
function uniqueRecipients(groups) {
    return [...new Set(groups.flat())];
}
