"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sigypProfileSchema = exports.SIGYP_PROFILE_FIELDS = exports.sigypWithdrawSchema = exports.sigypAnnouncementSchema = exports.SIGYP_CATEGORY_LABEL = exports.SIGYP_CATEGORIES = exports.SIGYP_SCOPES = exports.SIGYP_CONTRACT_VERSION = void 0;
exports.isAnnouncementVisible = isAnnouncementVisible;
exports.sigypManagedFieldsIn = sigypManagedFieldsIn;
const zod_1 = require("zod");
/**
 * Integración con SIGyP — Gestión Parroquial (contrato v1, ver docs/INTEGRACION-SIGYP.md). SIGyP es la fuente de verdad
 * de la cartelera y de los campos públicos del perfil que publica; Peregrinos los recibe por un canal autenticado con
 * una credencial POR ORGANIZACIÓN (la organización sale de la credencial, nunca del contenido). Cada elemento trae una
 * versión creciente: una versión no mayor que la guardada se ignora (reintentar nunca duplica ni retrocede).
 */
exports.SIGYP_CONTRACT_VERSION = 1;
exports.SIGYP_SCOPES = ["announcements:write", "profile:write"];
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
