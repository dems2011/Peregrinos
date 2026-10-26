import { z } from "zod";
/** Tipos de evento admitidos desde SIGyP: copia de EVENT_TYPES (index.ts) para no crear una dependencia circular;
 *  una prueba (s1) verifica que sean idénticos. */
export declare const SIGYP_EVENT_TYPES: readonly ["PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY", "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER"];
/**
 * Integración con SIGyP — Gestión Parroquial (contrato v1, ver docs/INTEGRACION-SIGYP.md). SIGyP es la fuente de verdad
 * de la cartelera y de los campos públicos del perfil que publica; Peregrinos los recibe por un canal autenticado con
 * una credencial POR ORGANIZACIÓN (la organización sale de la credencial, nunca del contenido). Cada elemento trae una
 * versión creciente: una versión no mayor que la guardada se ignora (reintentar nunca duplica ni retrocede).
 */
export declare const SIGYP_CONTRACT_VERSION = 1;
/**
 * Alcances de una credencial. `notices:send` = avisos a los SEGUIDORES; `notices:staff` = avisos al PERSONAL de la
 * parroquia: es un permiso aparte que el titular (SUPERADMIN) concede de forma explícita al vincular (D3).
 */
export declare const SIGYP_SCOPES: readonly ["announcements:write", "profile:write", "events:write", "notices:send", "notices:staff"];
export type SigypScope = (typeof SIGYP_SCOPES)[number];
/** Propuesta inicial de la pantalla de vinculación: todo menos los avisos al personal. */
export declare const SIGYP_DEFAULT_SCOPES: readonly SigypScope[];
export declare const SIGYP_SCOPE_LABEL: Record<SigypScope, string>;
/** Código de vinculación: alcances elegidos explícitamente por el titular + su contraseña. */
export declare const sigypLinkCodeCreateSchema: z.ZodObject<{
    scopes: z.ZodEffects<z.ZodArray<z.ZodEnum<["announcements:write", "profile:write", "events:write", "notices:send", "notices:staff"]>, "many">, ("announcements:write" | "profile:write" | "events:write" | "notices:send" | "notices:staff")[], ("announcements:write" | "profile:write" | "events:write" | "notices:send" | "notices:staff")[]>;
    password: z.ZodString;
}, "strict", z.ZodTypeAny, {
    scopes: ("announcements:write" | "profile:write" | "events:write" | "notices:send" | "notices:staff")[];
    password: string;
}, {
    scopes: ("announcements:write" | "profile:write" | "events:write" | "notices:send" | "notices:staff")[];
    password: string;
}>;
/** Credencial directa (solo SUPERADMIN): nombre, alcances explícitos y contraseña. */
export declare const sigypClientCreateSchema: z.ZodObject<{
    label: z.ZodDefault<z.ZodString>;
    scopes: z.ZodEffects<z.ZodArray<z.ZodEnum<["announcements:write", "profile:write", "events:write", "notices:send", "notices:staff"]>, "many">, ("announcements:write" | "profile:write" | "events:write" | "notices:send" | "notices:staff")[], ("announcements:write" | "profile:write" | "events:write" | "notices:send" | "notices:staff")[]>;
    password: z.ZodString;
}, "strict", z.ZodTypeAny, {
    scopes: ("announcements:write" | "profile:write" | "events:write" | "notices:send" | "notices:staff")[];
    password: string;
    label: string;
}, {
    scopes: ("announcements:write" | "profile:write" | "events:write" | "notices:send" | "notices:staff")[];
    password: string;
    label?: string | undefined;
}>;
/** Liberar el perfil (volver a editarlo en Peregrinos): solo la contraseña. */
export declare const sigypReauthSchema: z.ZodObject<{
    password: z.ZodString;
}, "strict", z.ZodTypeAny, {
    password: string;
}, {
    password: string;
}>;
export declare const SIGYP_CATEGORIES: readonly ["GENERAL", "LITURGIA", "SACRAMENTOS", "CATEQUESIS", "CARIDAD", "ACTIVIDADES", "SECRETARIA"];
export declare const SIGYP_CATEGORY_LABEL: Record<(typeof SIGYP_CATEGORIES)[number], string>;
export declare const sigypAnnouncementSchema: z.ZodEffects<z.ZodObject<{
    contract: z.ZodLiteral<1>;
    sourceId: z.ZodString;
    version: z.ZodNumber;
    title: z.ZodString;
    body: z.ZodString;
    category: z.ZodEnum<["GENERAL", "LITURGIA", "SACRAMENTOS", "CATEQUESIS", "CARIDAD", "ACTIVIDADES", "SECRETARIA"]>;
    startsAt: z.ZodString;
    endsAt: z.ZodNullable<z.ZodString>;
    publishedAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    title: string;
    body: string;
    category: "GENERAL" | "LITURGIA" | "SACRAMENTOS" | "CATEQUESIS" | "CARIDAD" | "ACTIVIDADES" | "SECRETARIA";
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    publishedAt: string;
}, {
    title: string;
    body: string;
    category: "GENERAL" | "LITURGIA" | "SACRAMENTOS" | "CATEQUESIS" | "CARIDAD" | "ACTIVIDADES" | "SECRETARIA";
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    publishedAt: string;
}>, {
    title: string;
    body: string;
    category: "GENERAL" | "LITURGIA" | "SACRAMENTOS" | "CATEQUESIS" | "CARIDAD" | "ACTIVIDADES" | "SECRETARIA";
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    publishedAt: string;
}, {
    title: string;
    body: string;
    category: "GENERAL" | "LITURGIA" | "SACRAMENTOS" | "CATEQUESIS" | "CARIDAD" | "ACTIVIDADES" | "SECRETARIA";
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    publishedAt: string;
}>;
export declare const sigypWithdrawSchema: z.ZodObject<{
    contract: z.ZodLiteral<1>;
    sourceId: z.ZodString;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    contract: 1;
    sourceId: string;
    version: number;
}, {
    contract: 1;
    sourceId: string;
    version: number;
}>;
/** Los nueve campos públicos que SIGyP administra (siempre presentes; null = vacío). Mismos límites que el perfil. */
export declare const SIGYP_PROFILE_FIELDS: readonly ["description", "address", "phone", "email", "website", "instagram", "facebook", "youtube", "officeHours"];
export declare const sigypProfileSchema: z.ZodObject<{
    contract: z.ZodLiteral<1>;
    version: z.ZodNumber;
    profile: z.ZodObject<{
        description: z.ZodNullable<z.ZodString>;
        address: z.ZodNullable<z.ZodString>;
        phone: z.ZodNullable<z.ZodString>;
        email: z.ZodNullable<z.ZodString>;
        website: z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>;
        instagram: z.ZodNullable<z.ZodString>;
        facebook: z.ZodNullable<z.ZodString>;
        youtube: z.ZodNullable<z.ZodString>;
        officeHours: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        description: string | null;
        website: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
        instagram: string | null;
        facebook: string | null;
        youtube: string | null;
        officeHours: string | null;
    }, {
        description: string | null;
        website: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
        instagram: string | null;
        facebook: string | null;
        youtube: string | null;
        officeHours: string | null;
    }>;
}, "strict", z.ZodTypeAny, {
    contract: 1;
    version: number;
    profile: {
        description: string | null;
        website: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
        instagram: string | null;
        facebook: string | null;
        youtube: string | null;
        officeHours: string | null;
    };
}, {
    contract: 1;
    version: number;
    profile: {
        description: string | null;
        website: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
        instagram: string | null;
        facebook: string | null;
        youtube: string | null;
        officeHours: string | null;
    };
}>;
export type SigypAnnouncement = z.infer<typeof sigypAnnouncementSchema>;
export type SigypProfile = z.infer<typeof sigypProfileSchema>;
/** ¿Se muestra al público ahora? No retirado, ya comenzó y no venció (endsAt exclusivo; sin endsAt no vence). */
export declare function isAnnouncementVisible(a: {
    withdrawnAt: Date | string | null;
    startsAt: Date | string;
    endsAt: Date | string | null;
}, now?: Date): boolean;
/** Campos del perfil que dejan de editarse en Peregrinos mientras la organización recibe el perfil desde SIGyP. */
export declare function sigypManagedFieldsIn(body: Record<string, unknown>): string[];
export declare const LINK_CODE_TTL_MINUTES = 15;
export declare function normalizeLinkCode(raw: string): string | null;
export declare function formatLinkCode(body20: string): string;
export declare const LINK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export declare const sigypLinkPreviewSchema: z.ZodObject<{
    code: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code: string;
}, {
    code: string;
}>;
export declare const sigypLinkCompleteSchema: z.ZodObject<{
    code: z.ZodString;
    /** Instalación de SIGyP que se vincula (para identificar la credencial; no concede nada). */
    installation: z.ZodObject<{
        parishCode: z.ZodString;
        label: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        label: string;
        parishCode: string;
    }, {
        label: string;
        parishCode: string;
    }>;
}, "strict", z.ZodTypeAny, {
    code: string;
    installation: {
        label: string;
        parishCode: string;
    };
}, {
    code: string;
    installation: {
        label: string;
        parishCode: string;
    };
}>;
export declare const SIGYP_ATTENDANCE_MODES: readonly ["IN_PERSON", "ONLINE", "HYBRID"];
export declare const sigypEventSchema: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodObject<{
    contract: z.ZodLiteral<1>;
    sourceId: z.ZodString;
    version: z.ZodNumber;
    title: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    eventType: z.ZodEnum<["PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY", "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER"]>;
    startsAt: z.ZodString;
    endsAt: z.ZodNullable<z.ZodString>;
    timezone: z.ZodString;
    locationName: z.ZodNullable<z.ZodString>;
    address: z.ZodNullable<z.ZodString>;
    attendanceMode: z.ZodEnum<["IN_PERSON", "ONLINE", "HYBRID"]>;
    onlineUrl: z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>;
    visibility: z.ZodEnum<["PUBLIC", "UNLISTED"]>;
}, "strict", z.ZodTypeAny, {
    title: string;
    timezone: string;
    description: string | null;
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    address: string | null;
    eventType: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY";
    locationName: string | null;
    attendanceMode: "IN_PERSON" | "ONLINE" | "HYBRID";
    onlineUrl: string | null;
    visibility: "PUBLIC" | "UNLISTED";
}, {
    title: string;
    timezone: string;
    description: string | null;
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    address: string | null;
    eventType: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY";
    locationName: string | null;
    attendanceMode: "IN_PERSON" | "ONLINE" | "HYBRID";
    onlineUrl: string | null;
    visibility: "PUBLIC" | "UNLISTED";
}>, {
    title: string;
    timezone: string;
    description: string | null;
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    address: string | null;
    eventType: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY";
    locationName: string | null;
    attendanceMode: "IN_PERSON" | "ONLINE" | "HYBRID";
    onlineUrl: string | null;
    visibility: "PUBLIC" | "UNLISTED";
}, {
    title: string;
    timezone: string;
    description: string | null;
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    address: string | null;
    eventType: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY";
    locationName: string | null;
    attendanceMode: "IN_PERSON" | "ONLINE" | "HYBRID";
    onlineUrl: string | null;
    visibility: "PUBLIC" | "UNLISTED";
}>, {
    title: string;
    timezone: string;
    description: string | null;
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    address: string | null;
    eventType: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY";
    locationName: string | null;
    attendanceMode: "IN_PERSON" | "ONLINE" | "HYBRID";
    onlineUrl: string | null;
    visibility: "PUBLIC" | "UNLISTED";
}, {
    title: string;
    timezone: string;
    description: string | null;
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    address: string | null;
    eventType: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY";
    locationName: string | null;
    attendanceMode: "IN_PERSON" | "ONLINE" | "HYBRID";
    onlineUrl: string | null;
    visibility: "PUBLIC" | "UNLISTED";
}>, {
    title: string;
    timezone: string;
    description: string | null;
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    address: string | null;
    eventType: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY";
    locationName: string | null;
    attendanceMode: "IN_PERSON" | "ONLINE" | "HYBRID";
    onlineUrl: string | null;
    visibility: "PUBLIC" | "UNLISTED";
}, {
    title: string;
    timezone: string;
    description: string | null;
    contract: 1;
    sourceId: string;
    version: number;
    startsAt: string;
    endsAt: string | null;
    address: string | null;
    eventType: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY";
    locationName: string | null;
    attendanceMode: "IN_PERSON" | "ONLINE" | "HYBRID";
    onlineUrl: string | null;
    visibility: "PUBLIC" | "UNLISTED";
}>;
export declare const sigypEventWithdrawSchema: z.ZodObject<{
    contract: z.ZodLiteral<1>;
    sourceId: z.ZodString;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    contract: 1;
    sourceId: string;
    version: number;
}, {
    contract: 1;
    sourceId: string;
    version: number;
}>;
export type SigypEvent = z.infer<typeof sigypEventSchema>;
/** Grupos de destinatarios en Peregrinos. Se derivan de datos reales: seguidores y personal según su rol. */
export declare const NOTICE_AUDIENCES: readonly ["FOLLOWERS", "STAFF:SUPERADMIN", "STAFF:ADMIN", "STAFF:OPERATOR"];
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];
export declare const NOTICE_AUDIENCE_LABEL: Record<NoticeAudience, string>;
export declare const noticeAudiencesSchema: z.ZodEffects<z.ZodArray<z.ZodEnum<["FOLLOWERS", "STAFF:SUPERADMIN", "STAFF:ADMIN", "STAFF:OPERATOR"]>, "many">, ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[], ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[]>;
export declare const multiNoticeSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    title: z.ZodString;
    body: z.ZodString;
    audiences: z.ZodEffects<z.ZodArray<z.ZodEnum<["FOLLOWERS", "STAFF:SUPERADMIN", "STAFF:ADMIN", "STAFF:OPERATOR"]>, "many">, ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[], ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[]>;
    delivery: z.ZodDefault<z.ZodEnum<["PUSH", "INBOX"]>>;
    eventId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    urgent: z.ZodDefault<z.ZodBoolean>;
    /** Alerta urgente: motivo obligatorio (queda en la auditoría). */
    urgentReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    /** Confirmación explícita del resumen de destinatarios mostrado antes de enviar. */
    confirmedRecipients: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    title: string;
    body: string;
    audiences: ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[];
    delivery: "PUSH" | "INBOX";
    urgent: boolean;
    confirmedRecipients: number;
    eventId?: string | null | undefined;
    urgentReason?: string | null | undefined;
}, {
    title: string;
    body: string;
    audiences: ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[];
    confirmedRecipients: number;
    eventId?: string | null | undefined;
    delivery?: "PUSH" | "INBOX" | undefined;
    urgent?: boolean | undefined;
    urgentReason?: string | null | undefined;
}>, {
    title: string;
    body: string;
    audiences: ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[];
    delivery: "PUSH" | "INBOX";
    urgent: boolean;
    confirmedRecipients: number;
    eventId?: string | null | undefined;
    urgentReason?: string | null | undefined;
}, {
    title: string;
    body: string;
    audiences: ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[];
    confirmedRecipients: number;
    eventId?: string | null | undefined;
    delivery?: "PUSH" | "INBOX" | undefined;
    urgent?: boolean | undefined;
    urgentReason?: string | null | undefined;
}>, {
    title: string;
    body: string;
    audiences: ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[];
    delivery: "PUSH" | "INBOX";
    urgent: boolean;
    confirmedRecipients: number;
    eventId?: string | null | undefined;
    urgentReason?: string | null | undefined;
}, {
    title: string;
    body: string;
    audiences: ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[];
    confirmedRecipients: number;
    eventId?: string | null | undefined;
    delivery?: "PUSH" | "INBOX" | undefined;
    urgent?: boolean | undefined;
    urgentReason?: string | null | undefined;
}>;
export declare const sigypNoticeSchema: z.ZodObject<{
    contract: z.ZodLiteral<1>;
    sourceId: z.ZodString;
    title: z.ZodString;
    body: z.ZodString;
    audiences: z.ZodEffects<z.ZodArray<z.ZodEnum<["FOLLOWERS", "STAFF:SUPERADMIN", "STAFF:ADMIN", "STAFF:OPERATOR"]>, "many">, ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[], ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[]>;
    delivery: z.ZodEnum<["PUSH", "INBOX"]>;
}, "strict", z.ZodTypeAny, {
    title: string;
    body: string;
    contract: 1;
    sourceId: string;
    audiences: ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[];
    delivery: "PUSH" | "INBOX";
}, {
    title: string;
    body: string;
    contract: 1;
    sourceId: string;
    audiences: ("FOLLOWERS" | "STAFF:SUPERADMIN" | "STAFF:ADMIN" | "STAFF:OPERATOR")[];
    delivery: "PUSH" | "INBOX";
}>;
/** Grupos a los que puede enviar una credencial de SIGyP según sus alcances (seguidores y personal van por separado). */
export declare function sigypAllowedAudiences(scopes: readonly string[]): NoticeAudience[];
/** Destinatarios únicos de varios grupos: una persona en dos grupos recibe UN aviso. */
export declare function uniqueRecipients(groups: readonly (readonly string[])[]): string[];
