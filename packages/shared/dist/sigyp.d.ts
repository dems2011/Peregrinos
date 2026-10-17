import { z } from "zod";
/**
 * Integración con SIGyP — Gestión Parroquial (contrato v1, ver docs/INTEGRACION-SIGYP.md). SIGyP es la fuente de verdad
 * de la cartelera y de los campos públicos del perfil que publica; Peregrinos los recibe por un canal autenticado con
 * una credencial POR ORGANIZACIÓN (la organización sale de la credencial, nunca del contenido). Cada elemento trae una
 * versión creciente: una versión no mayor que la guardada se ignora (reintentar nunca duplica ni retrocede).
 */
export declare const SIGYP_CONTRACT_VERSION = 1;
export declare const SIGYP_SCOPES: readonly ["announcements:write", "profile:write"];
export type SigypScope = (typeof SIGYP_SCOPES)[number];
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
