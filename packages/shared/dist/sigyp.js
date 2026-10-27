"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sigypNoticeSchema = exports.multiNoticeSchema = exports.noticeAudiencesSchema = exports.NOTICE_AUDIENCE_LABEL = exports.NOTICE_AUDIENCES = exports.incomingRequestsQuerySchema = exports.pilgrimRequestCreateSchema = exports.sigypRequestStatusSchema = exports.PILGRIM_REQUEST_OPEN = exports.PILGRIM_REQUEST_STATUS_LABEL = exports.PILGRIM_REQUEST_STATUSES = exports.sigypRequestTypeSchema = exports.turnDecisionsQuerySchema = exports.turnDecisionSchema = exports.TURN_DECISIONS = exports.sigypTurnSchema = exports.TURN_STATUSES_FROM_SIGYP = exports.sigypEventWithdrawSchema = exports.sigypEventSchema = exports.SIGYP_ATTENDANCE_MODES = exports.sigypLinkCompleteSchema = exports.sigypLinkPreviewSchema = exports.LINK_CODE_ALPHABET = exports.LINK_CODE_TTL_MINUTES = exports.sigypProfileSchema = exports.SIGYP_PROFILE_FIELDS = exports.sigypWithdrawSchema = exports.sigypAnnouncementSchema = exports.SIGYP_CATEGORY_LABEL = exports.SIGYP_CATEGORIES = exports.sigypReauthSchema = exports.sigypClientCreateSchema = exports.sigypLinkCodeCreateSchema = exports.SIGYP_SCOPE_LABEL = exports.SIGYP_DEFAULT_SCOPES = exports.SIGYP_SCOPES = exports.SIGYP_CONTRACT_VERSION = exports.SIGYP_EVENT_TYPES = void 0;
exports.isAnnouncementVisible = isAnnouncementVisible;
exports.sigypManagedFieldsIn = sigypManagedFieldsIn;
exports.normalizeLinkCode = normalizeLinkCode;
exports.formatLinkCode = formatLinkCode;
exports.sigypAllowedAudiences = sigypAllowedAudiences;
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
/**
 * Alcances de una credencial. `notices:send` = avisos a los SEGUIDORES; `notices:staff` = avisos al PERSONAL de la
 * parroquia: es un permiso aparte que el titular (SUPERADMIN) concede de forma explícita al vincular (D3).
 */
exports.SIGYP_SCOPES = ["announcements:write", "profile:write", "events:write", "notices:send", "notices:staff", "turns:write", "requests:sync"];
/** Propuesta inicial de la pantalla de vinculación: todo menos los avisos al personal. */
exports.SIGYP_DEFAULT_SCOPES = ["announcements:write", "profile:write", "events:write", "notices:send", "turns:write", "requests:sync"];
exports.SIGYP_SCOPE_LABEL = {
    "announcements:write": "Cartelera: avisos públicos con vigencia",
    "profile:write": "Datos públicos del perfil (descripción, contacto, canales y horarios)",
    "events:write": "Eventos públicos de la parroquia (sin inscripciones ni datos de participantes)",
    "notices:send": "Avisos a los seguidores de la parroquia (sin acceso a sus datos)",
    "notices:staff": "Avisos al personal de la parroquia (administración y operadores)",
    "turns:write": "Turnos que el sacerdote acepta o rechaza desde Peregrinos (sin datos de contacto)",
    "requests:sync": "Solicitudes de los fieles: SIGyP recibe el pedido (nombre, contacto y descripción) y publica su estado",
};
const scopeList = zod_1.z.array(zod_1.z.enum(exports.SIGYP_SCOPES)).min(1, "Elige al menos un permiso").max(exports.SIGYP_SCOPES.length)
    .refine((s) => new Set(s).size === s.length, "Permisos repetidos");
/** Reautenticación (D1): la contraseña de quien opera, en la misma petición; nunca se guarda ni se registra. */
const reauthPassword = zod_1.z.string().min(1, "Escribe tu contraseña").max(128);
/** Código de vinculación: alcances elegidos explícitamente por el titular + su contraseña. */
exports.sigypLinkCodeCreateSchema = zod_1.z.object({ scopes: scopeList, password: reauthPassword }).strict();
/** Credencial directa (solo SUPERADMIN): nombre, alcances explícitos y contraseña. */
exports.sigypClientCreateSchema = zod_1.z.object({ label: zod_1.z.string().trim().min(3).max(80).default("SIGyP"), scopes: scopeList, password: reauthPassword }).strict();
/** Liberar el perfil (volver a editarlo en Peregrinos): solo la contraseña. */
exports.sigypReauthSchema = zod_1.z.object({ password: reauthPassword }).strict();
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
/* -------- Turnos con decisión del sacerdote (2026-10-27) -------- */
/**
 * Turno que SIGyP pide decidir al sacerdote. Solo lo necesario para decidir: NUNCA datos de contacto ni del expediente
 * (la nota es texto libre de quien carga, con tope). Cada envío trae una versión creciente; WITHDRAWN = ya no requiere
 * decisión (se canceló o se resolvió en SIGyP).
 */
exports.TURN_STATUSES_FROM_SIGYP = ["PENDING", "WITHDRAWN"];
exports.sigypTurnSchema = zod_1.z.object({
    contract: zod_1.z.literal(1),
    sourceId: zod_1.z.string().uuid(),
    version: zod_1.z.number().int().min(1).max(1_000_000),
    title: zod_1.z.string().trim().min(3).max(150),
    category: zod_1.z.string().trim().max(60).nullable(),
    startsAt: iso,
    endsAt: iso,
    location: zod_1.z.string().trim().max(160).nullable(),
    note: zod_1.z.string().trim().max(500).nullable(),
    status: zod_1.z.enum(exports.TURN_STATUSES_FROM_SIGYP),
}).strict().refine((t) => new Date(t.endsAt).getTime() > new Date(t.startsAt).getTime(), { message: "endsAt debe ser posterior a startsAt", path: ["endsAt"] });
/** Decisión del sacerdote en Peregrinos: sobre la versión que está viendo; rechazar exige motivo. */
exports.TURN_DECISIONS = ["ACCEPTED", "REJECTED"];
exports.turnDecisionSchema = zod_1.z.object({
    decision: zod_1.z.enum(exports.TURN_DECISIONS),
    version: zod_1.z.number().int().min(1),
    // Mínimo 5: el mismo que exige SIGyP a un rechazo (AgendaEvent_reject_reason_length), para que se pueda aplicar allí.
    reason: zod_1.z.string().trim().min(5, "Indica el motivo (al menos 5 caracteres)").max(300).nullable().optional(),
}).strict().refine((d) => d.decision !== "REJECTED" || !!d.reason, { message: "Rechazar un turno exige un motivo", path: ["reason"] });
/** Cursor de decisiones que lee SIGyP (`GET /turns/decisions?after=N`). */
exports.turnDecisionsQuerySchema = zod_1.z.object({ after: zod_1.z.coerce.number().int().min(0).default(0), limit: zod_1.z.coerce.number().int().min(1).max(200).default(100) });
/* -------- Solicitudes de los fieles (2026-10-27, alcance requests:sync) -------- */
/**
 * Tipo de trámite que la parroquia habilita para pedir desde Peregrinos (lo define SIGyP; Peregrinos no inventa tipos).
 * WITHDRAWN = ya no se puede pedir en línea (las solicitudes existentes siguen).
 */
exports.sigypRequestTypeSchema = zod_1.z.object({
    contract: zod_1.z.literal(1),
    sourceId: zod_1.z.string().uuid(),
    version: zod_1.z.number().int().min(1).max(1_000_000),
    name: zod_1.z.string().trim().min(3).max(120),
    description: zod_1.z.string().trim().max(600),
    status: zod_1.z.enum(["ACTIVE", "WITHDRAWN"]),
}).strict();
/** Estados de una solicitud: SENT = enviada, la parroquia todavía no la recibió; el resto los fija SIGyP. */
exports.PILGRIM_REQUEST_STATUSES = ["SENT", "RECEIVED", "IN_PROGRESS", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CLOSED", "CANCELLED"];
exports.PILGRIM_REQUEST_STATUS_LABEL = {
    SENT: "Enviada", RECEIVED: "Recibida por la parroquia", IN_PROGRESS: "En curso", PENDING_APPROVAL: "Pendiente de aprobación",
    APPROVED: "Aprobada", REJECTED: "Rechazada", CLOSED: "Finalizada", CANCELLED: "Cancelada",
};
/** Estados en los que la solicitud sigue abierta (cuentan para el tope por persona). */
exports.PILGRIM_REQUEST_OPEN = ["SENT", "RECEIVED", "IN_PROGRESS", "PENDING_APPROVAL"];
/**
 * Estado que SIGyP publica (versión creciente). `message` es un texto PARA LA PERSONA que escribe expresamente quien
 * gestiona en SIGyP (nunca las notas internas); `number` es el número de trámite de la parroquia.
 */
exports.sigypRequestStatusSchema = zod_1.z.object({
    contract: zod_1.z.literal(1),
    sourceId: zod_1.z.string().uuid(),
    version: zod_1.z.number().int().min(1).max(1_000_000),
    status: zod_1.z.enum(exports.PILGRIM_REQUEST_STATUSES).exclude(["SENT"]),
    number: zod_1.z.string().trim().max(40).nullable(),
    message: zod_1.z.string().trim().max(500).nullable(),
}).strict();
/** Lo que pide el fiel (desde su cuenta): nombre y correo salen de la cuenta; el teléfono es opcional. */
exports.pilgrimRequestCreateSchema = zod_1.z.object({
    organizationId: zod_1.z.string().uuid(),
    typeId: zod_1.z.string().uuid(),
    description: zod_1.z.string().trim().min(10, "Cuéntale a la parroquia qué necesitas (al menos 10 caracteres)").max(2000),
    phone: zod_1.z.string().trim().max(40).regex(/^[0-9+()\s-]*$/, "Teléfono inválido").optional(),
}).strict();
/** Cursor de solicitudes nuevas que lee SIGyP (`GET /requests/incoming?after=N`). */
exports.incomingRequestsQuerySchema = exports.turnDecisionsQuerySchema;
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
/** Grupos a los que puede enviar una credencial de SIGyP según sus alcances (seguidores y personal van por separado). */
function sigypAllowedAudiences(scopes) {
    return exports.NOTICE_AUDIENCES.filter((a) => (a === "FOLLOWERS" ? scopes.includes("notices:send") : scopes.includes("notices:staff")));
}
/** Destinatarios únicos de varios grupos: una persona en dos grupos recibe UN aviso. */
function uniqueRecipients(groups) {
    return [...new Set(groups.flat())];
}
