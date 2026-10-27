import { z } from "zod";

/** Tipos de evento admitidos desde SIGyP: copia de EVENT_TYPES (index.ts) para no crear una dependencia circular;
 *  una prueba (s1) verifica que sean idénticos. */
export const SIGYP_EVENT_TYPES = [
  "PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY",
  "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER",
] as const;

/**
 * Integración con SIGyP — Gestión Parroquial (contrato v1, ver docs/INTEGRACION-SIGYP.md). SIGyP es la fuente de verdad
 * de la cartelera y de los campos públicos del perfil que publica; Peregrinos los recibe por un canal autenticado con
 * una credencial POR ORGANIZACIÓN (la organización sale de la credencial, nunca del contenido). Cada elemento trae una
 * versión creciente: una versión no mayor que la guardada se ignora (reintentar nunca duplica ni retrocede).
 */
export const SIGYP_CONTRACT_VERSION = 1;
/**
 * Alcances de una credencial. `notices:send` = avisos a los SEGUIDORES; `notices:staff` = avisos al PERSONAL de la
 * parroquia: es un permiso aparte que el titular (SUPERADMIN) concede de forma explícita al vincular (D3).
 */
export const SIGYP_SCOPES = ["announcements:write", "profile:write", "events:write", "notices:send", "notices:staff", "turns:write"] as const;
export type SigypScope = (typeof SIGYP_SCOPES)[number];
/** Propuesta inicial de la pantalla de vinculación: todo menos los avisos al personal. */
export const SIGYP_DEFAULT_SCOPES: readonly SigypScope[] = ["announcements:write", "profile:write", "events:write", "notices:send", "turns:write"];
export const SIGYP_SCOPE_LABEL: Record<SigypScope, string> = {
  "announcements:write": "Cartelera: avisos públicos con vigencia",
  "profile:write": "Datos públicos del perfil (descripción, contacto, canales y horarios)",
  "events:write": "Eventos públicos de la parroquia (sin inscripciones ni datos de participantes)",
  "notices:send": "Avisos a los seguidores de la parroquia (sin acceso a sus datos)",
  "notices:staff": "Avisos al personal de la parroquia (administración y operadores)",
  "turns:write": "Turnos que el sacerdote acepta o rechaza desde Peregrinos (sin datos de contacto)",
};
const scopeList = z.array(z.enum(SIGYP_SCOPES)).min(1, "Elige al menos un permiso").max(SIGYP_SCOPES.length)
  .refine((s) => new Set(s).size === s.length, "Permisos repetidos");
/** Reautenticación (D1): la contraseña de quien opera, en la misma petición; nunca se guarda ni se registra. */
const reauthPassword = z.string().min(1, "Escribe tu contraseña").max(128);
/** Código de vinculación: alcances elegidos explícitamente por el titular + su contraseña. */
export const sigypLinkCodeCreateSchema = z.object({ scopes: scopeList, password: reauthPassword }).strict();
/** Credencial directa (solo SUPERADMIN): nombre, alcances explícitos y contraseña. */
export const sigypClientCreateSchema = z.object({ label: z.string().trim().min(3).max(80).default("SIGyP"), scopes: scopeList, password: reauthPassword }).strict();
/** Liberar el perfil (volver a editarlo en Peregrinos): solo la contraseña. */
export const sigypReauthSchema = z.object({ password: reauthPassword }).strict();

export const SIGYP_CATEGORIES = ["GENERAL", "LITURGIA", "SACRAMENTOS", "CATEQUESIS", "CARIDAD", "ACTIVIDADES", "SECRETARIA"] as const;
export const SIGYP_CATEGORY_LABEL: Record<(typeof SIGYP_CATEGORIES)[number], string> = {
  GENERAL: "General", LITURGIA: "Liturgia y celebraciones", SACRAMENTOS: "Sacramentos", CATEQUESIS: "Catequesis",
  CARIDAD: "Caridad y servicio", ACTIVIDADES: "Actividades", SECRETARIA: "Secretaría parroquial",
};

const iso = z.string().datetime({ offset: true });

export const sigypAnnouncementSchema = z.object({
  contract: z.literal(1),
  sourceId: z.string().uuid(),
  version: z.number().int().min(1).max(1_000_000),
  title: z.string().trim().min(3).max(150),
  body: z.string().trim().min(3).max(5000),
  category: z.enum(SIGYP_CATEGORIES),
  startsAt: iso,
  endsAt: iso.nullable(),
  publishedAt: iso,
}).strict().refine((a) => a.endsAt === null || new Date(a.endsAt).getTime() > new Date(a.startsAt).getTime(), {
  message: "endsAt debe ser posterior a startsAt", path: ["endsAt"],
});

export const sigypWithdrawSchema = z.object({
  contract: z.literal(1),
  sourceId: z.string().uuid(),
  version: z.number().int().min(1).max(1_000_000),
}).strict();

/** Los nueve campos públicos que SIGyP administra (siempre presentes; null = vacío). Mismos límites que el perfil. */
export const SIGYP_PROFILE_FIELDS = ["description", "address", "phone", "email", "website", "instagram", "facebook", "youtube", "officeHours"] as const;
const opt = (max: number) => z.string().trim().max(max).nullable();
export const sigypProfileSchema = z.object({
  contract: z.literal(1),
  version: z.number().int().min(1).max(1_000_000),
  profile: z.object({
    description: opt(2000),
    address: opt(240),
    phone: opt(40),
    email: z.string().trim().toLowerCase().email().max(200).nullable(),
    website: z.string().trim().url().max(300).refine((u) => u.startsWith("https://"), "Debe ser https").nullable(),
    instagram: opt(200),
    facebook: opt(200),
    youtube: opt(200),
    officeHours: opt(1000),
  }).strict(),
}).strict();

export type SigypAnnouncement = z.infer<typeof sigypAnnouncementSchema>;
export type SigypProfile = z.infer<typeof sigypProfileSchema>;

/** ¿Se muestra al público ahora? No retirado, ya comenzó y no venció (endsAt exclusivo; sin endsAt no vence). */
export function isAnnouncementVisible(a: { withdrawnAt: Date | string | null; startsAt: Date | string; endsAt: Date | string | null }, now: Date = new Date()): boolean {
  if (a.withdrawnAt) return false;
  const t = now.getTime();
  if (new Date(a.startsAt).getTime() > t) return false;
  return a.endsAt === null || new Date(a.endsAt).getTime() > t;
}

/** Campos del perfil que dejan de editarse en Peregrinos mientras la organización recibe el perfil desde SIGyP. */
export function sigypManagedFieldsIn(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter((k) => (SIGYP_PROFILE_FIELDS as readonly string[]).includes(k));
}

/* -------- Vinculación con código de un solo uso (lo genera el SUPERADMIN en Peregrinos) -------- */

/** «PGV-» + 4 grupos de 5 caracteres base32 sin ambiguos (≈100 bits). Se compara sin guiones ni mayúsculas. */
const LINK_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LINK_CODE_TTL_MINUTES = 15;
export function normalizeLinkCode(raw: string): string | null {
  const c = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!c.startsWith("PGV") || c.length !== 23) return null;
  const body = c.slice(3);
  return [...body].every((ch) => LINK_ALPHABET.includes(ch)) ? c : null;
}
export function formatLinkCode(body20: string): string {
  return `PGV-${body20.match(/.{5}/g)!.join("-")}`;
}
export const LINK_CODE_ALPHABET = LINK_ALPHABET;

export const sigypLinkPreviewSchema = z.object({ code: z.string().trim().min(10).max(40) }).strict();
export const sigypLinkCompleteSchema = z.object({
  code: z.string().trim().min(10).max(40),
  /** Instalación de SIGyP que se vincula (para identificar la credencial; no concede nada). */
  installation: z.object({ parishCode: z.string().trim().min(2).max(40), label: z.string().trim().min(3).max(80) }).strict(),
}).strict();

/* -------- Eventos publicados desde SIGyP (usan el modelo Event de Peregrinos) -------- */

export const SIGYP_ATTENDANCE_MODES = ["IN_PERSON", "ONLINE", "HYBRID"] as const;
const https = z.string().trim().url().max(300).refine((u) => u.startsWith("https://"), "Debe ser https");
export const sigypEventSchema = z.object({
  contract: z.literal(1),
  sourceId: z.string().uuid(),
  version: z.number().int().min(1).max(1_000_000),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(5000).nullable(),
  eventType: z.enum(SIGYP_EVENT_TYPES),
  startsAt: iso,
  endsAt: iso.nullable(),
  timezone: z.string().trim().min(3).max(64).regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$|^UTC$/),
  locationName: z.string().trim().max(160).nullable(),
  address: z.string().trim().max(240).nullable(),
  attendanceMode: z.enum(SIGYP_ATTENDANCE_MODES),
  onlineUrl: https.nullable(),
  visibility: z.enum(["PUBLIC", "UNLISTED"]),
}).strict()
  .refine((e) => e.endsAt === null || new Date(e.endsAt).getTime() > new Date(e.startsAt).getTime(), { message: "endsAt debe ser posterior a startsAt", path: ["endsAt"] })
  .refine((e) => e.attendanceMode === "IN_PERSON" || e.onlineUrl !== null, { message: "Un evento virtual o mixto necesita el enlace de participación", path: ["onlineUrl"] })
  .refine((e) => e.attendanceMode === "ONLINE" || e.locationName !== null || e.address !== null, { message: "Un evento presencial o mixto necesita lugar o dirección", path: ["locationName"] });
export const sigypEventWithdrawSchema = sigypWithdrawSchema;
export type SigypEvent = z.infer<typeof sigypEventSchema>;

/* -------- Turnos con decisión del sacerdote (2026-10-27) -------- */

/**
 * Turno que SIGyP pide decidir al sacerdote. Solo lo necesario para decidir: NUNCA datos de contacto ni del expediente
 * (la nota es texto libre de quien carga, con tope). Cada envío trae una versión creciente; WITHDRAWN = ya no requiere
 * decisión (se canceló o se resolvió en SIGyP).
 */
export const TURN_STATUSES_FROM_SIGYP = ["PENDING", "WITHDRAWN"] as const;
export const sigypTurnSchema = z.object({
  contract: z.literal(1),
  sourceId: z.string().uuid(),
  version: z.number().int().min(1).max(1_000_000),
  title: z.string().trim().min(3).max(150),
  category: z.string().trim().max(60).nullable(),
  startsAt: iso,
  endsAt: iso,
  location: z.string().trim().max(160).nullable(),
  note: z.string().trim().max(500).nullable(),
  status: z.enum(TURN_STATUSES_FROM_SIGYP),
}).strict().refine((t) => new Date(t.endsAt).getTime() > new Date(t.startsAt).getTime(), { message: "endsAt debe ser posterior a startsAt", path: ["endsAt"] });
export type SigypTurn = z.infer<typeof sigypTurnSchema>;

/** Decisión del sacerdote en Peregrinos: sobre la versión que está viendo; rechazar exige motivo. */
export const TURN_DECISIONS = ["ACCEPTED", "REJECTED"] as const;
export type TurnDecision = (typeof TURN_DECISIONS)[number];
export const turnDecisionSchema = z.object({
  decision: z.enum(TURN_DECISIONS),
  version: z.number().int().min(1),
  // Mínimo 5: el mismo que exige SIGyP a un rechazo (AgendaEvent_reject_reason_length), para que se pueda aplicar allí.
  reason: z.string().trim().min(5, "Indica el motivo (al menos 5 caracteres)").max(300).nullable().optional(),
}).strict().refine((d) => d.decision !== "REJECTED" || !!d.reason, { message: "Rechazar un turno exige un motivo", path: ["reason"] });

/** Cursor de decisiones que lee SIGyP (`GET /turns/decisions?after=N`). */
export const turnDecisionsQuerySchema = z.object({ after: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(200).default(100) });

/* -------- Avisos multigrupo (lógica de destinatarios compartida) -------- */

/** Grupos de destinatarios en Peregrinos. Se derivan de datos reales: seguidores y personal según su rol. */
export const NOTICE_AUDIENCES = ["FOLLOWERS", "STAFF:SUPERADMIN", "STAFF:ADMIN", "STAFF:OPERATOR"] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];
export const NOTICE_AUDIENCE_LABEL: Record<NoticeAudience, string> = {
  FOLLOWERS: "Seguidores de la parroquia", "STAFF:SUPERADMIN": "Administración: titular", "STAFF:ADMIN": "Administración: administradores",
  "STAFF:OPERATOR": "Personal operativo",
};
export const noticeAudiencesSchema = z.array(z.enum(NOTICE_AUDIENCES)).min(1).max(NOTICE_AUDIENCES.length)
  .refine((a) => new Set(a).size === a.length, "Grupos repetidos");
export const multiNoticeSchema = z.object({
  title: z.string().trim().min(3, "Escribe un título").max(120),
  body: z.string().trim().min(3, "Escribe el mensaje").max(2000),
  audiences: noticeAudiencesSchema,
  delivery: z.enum(["PUSH", "INBOX"]).default("PUSH"),
  eventId: z.string().uuid().nullable().optional(),
  urgent: z.boolean().default(false),
  /** Alerta urgente: motivo obligatorio (queda en la auditoría). */
  urgentReason: z.string().trim().min(10).max(300).nullable().optional(),
  /** Confirmación explícita del resumen de destinatarios mostrado antes de enviar. */
  confirmedRecipients: z.number().int().min(0),
}).strict().refine((n) => !n.urgent || !!n.urgentReason, { message: "Una alerta urgente necesita un motivo", path: ["urgentReason"] })
  .refine((n) => !n.urgent || n.delivery === "PUSH", { message: "Una alerta urgente se envía como push", path: ["delivery"] });
export const sigypNoticeSchema = z.object({
  contract: z.literal(1),
  sourceId: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000),
  audiences: noticeAudiencesSchema,
  delivery: z.enum(["PUSH", "INBOX"]),
}).strict();

/** Grupos a los que puede enviar una credencial de SIGyP según sus alcances (seguidores y personal van por separado). */
export function sigypAllowedAudiences(scopes: readonly string[]): NoticeAudience[] {
  return NOTICE_AUDIENCES.filter((a) => (a === "FOLLOWERS" ? scopes.includes("notices:send") : scopes.includes("notices:staff")));
}

/** Destinatarios únicos de varios grupos: una persona en dos grupos recibe UN aviso. */
export function uniqueRecipients(groups: readonly (readonly string[])[]): string[] {
  return [...new Set(groups.flat())];
}
