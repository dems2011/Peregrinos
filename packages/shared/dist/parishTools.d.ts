import { z } from "zod";
export declare const LIVESTREAM_STATUS_LABEL: {
    readonly SCHEDULED: "Programada";
    readonly LIVE: "En vivo";
    readonly ENDED: "Finalizada";
};
export declare const createLivestreamSchema: z.ZodObject<{
    title: z.ZodString;
    /** Enlace del video o de la transmisión de YouTube (la API extrae y valida el id). */
    url: z.ZodString;
    eventId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    scheduledAt: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodDate>>, Date | null | undefined, unknown>;
}, "strict", z.ZodTypeAny, {
    title: string;
    url: string;
    eventId?: string | null | undefined;
    scheduledAt?: Date | null | undefined;
}, {
    title: string;
    url: string;
    eventId?: string | null | undefined;
    scheduledAt?: unknown;
}>;
export declare const updateLivestreamSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    eventId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    scheduledAt: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodDate>>, Date | null | undefined, unknown>>;
}, "strict", z.ZodTypeAny, {
    title?: string | undefined;
    url?: string | undefined;
    eventId?: string | null | undefined;
    scheduledAt?: Date | null | undefined;
}, {
    title?: string | undefined;
    url?: string | undefined;
    eventId?: string | null | undefined;
    scheduledAt?: unknown;
}>;
/** Una posición más vieja que esto se muestra como «sin señal». */
export declare const TRACKING_STALE_MS: number;
/** Intervalo mínimo entre envíos del teléfono (la API también limita la frecuencia). */
export declare const TRACKING_MIN_INTERVAL_MS = 30000;
export declare const locationPingSchema: z.ZodObject<{
    latitude: z.ZodNumber;
    longitude: z.ZodNumber;
    accuracy: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    /** Hora del dispositivo (ISO). No puede ser futura ni de hace más de 1 hora. */
    recordedAt: z.ZodDate;
}, "strict", z.ZodTypeAny, {
    latitude: number;
    longitude: number;
    recordedAt: Date;
    accuracy?: number | null | undefined;
}, {
    latitude: number;
    longitude: number;
    recordedAt: Date;
    accuracy?: number | null | undefined;
}>;
export declare const trackingSettingsSchema: z.ZodObject<{
    trackingEnabled: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    trackingEnabled: boolean;
}, {
    trackingEnabled: boolean;
}>;
export declare const SCHEDULE_KINDS: readonly ["MASS", "CONFESSION", "ADORATION", "CATECHESIS", "MEETING", "PATRONAL", "OTHER"];
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];
export declare const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string>;
export declare const WEEKDAY_LABEL: readonly ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export declare const scheduleItemSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    kind: z.ZodEnum<["MASS", "CONFESSION", "ADORATION", "CATECHESIS", "MEETING", "PATRONAL", "OTHER"]>;
    title: z.ZodString;
    /** Cada semana (0 = domingo … 6 = sábado) o un día puntual (date). Exactamente uno de los dos. */
    weekday: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    date: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    startTime: z.ZodString;
    endTime: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    location: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    active: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    title: string;
    kind: "MASS" | "CONFESSION" | "ADORATION" | "CATECHESIS" | "MEETING" | "PATRONAL" | "OTHER";
    startTime: string;
    date?: string | null | undefined;
    weekday?: number | null | undefined;
    endTime?: string | null | undefined;
    location?: string | null | undefined;
    notes?: string | null | undefined;
    active?: boolean | undefined;
}, {
    title: string;
    kind: "MASS" | "CONFESSION" | "ADORATION" | "CATECHESIS" | "MEETING" | "PATRONAL" | "OTHER";
    startTime: string;
    date?: unknown;
    weekday?: number | null | undefined;
    endTime?: unknown;
    location?: unknown;
    notes?: unknown;
    active?: boolean | undefined;
}>, {
    title: string;
    kind: "MASS" | "CONFESSION" | "ADORATION" | "CATECHESIS" | "MEETING" | "PATRONAL" | "OTHER";
    startTime: string;
    date?: string | null | undefined;
    weekday?: number | null | undefined;
    endTime?: string | null | undefined;
    location?: string | null | undefined;
    notes?: string | null | undefined;
    active?: boolean | undefined;
}, {
    title: string;
    kind: "MASS" | "CONFESSION" | "ADORATION" | "CATECHESIS" | "MEETING" | "PATRONAL" | "OTHER";
    startTime: string;
    date?: unknown;
    weekday?: number | null | undefined;
    endTime?: unknown;
    location?: unknown;
    notes?: unknown;
    active?: boolean | undefined;
}>, {
    title: string;
    kind: "MASS" | "CONFESSION" | "ADORATION" | "CATECHESIS" | "MEETING" | "PATRONAL" | "OTHER";
    startTime: string;
    date?: string | null | undefined;
    weekday?: number | null | undefined;
    endTime?: string | null | undefined;
    location?: string | null | undefined;
    notes?: string | null | undefined;
    active?: boolean | undefined;
}, {
    title: string;
    kind: "MASS" | "CONFESSION" | "ADORATION" | "CATECHESIS" | "MEETING" | "PATRONAL" | "OTHER";
    startTime: string;
    date?: unknown;
    weekday?: number | null | undefined;
    endTime?: unknown;
    location?: unknown;
    notes?: unknown;
    active?: boolean | undefined;
}>;
export declare const organizationTimezoneSchema: z.ZodObject<{
    timezone: z.ZodString;
}, "strict", z.ZodTypeAny, {
    timezone: string;
}, {
    timezone: string;
}>;
export declare const DONATION_PURPOSES: readonly ["MAINTENANCE", "WORKS", "CHARITY", "SPECIAL", "OTHER"];
export type DonationPurpose = (typeof DONATION_PURPOSES)[number];
export declare const DONATION_PURPOSE_LABEL: Record<DonationPurpose, string>;
export declare function isAllowedDonationUrl(raw: string): boolean;
export declare const donationCampaignSchema: z.ZodObject<{
    title: z.ZodString;
    purpose: z.ZodEnum<["MAINTENANCE", "WORKS", "CHARITY", "SPECIAL", "OTHER"]>;
    description: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    beneficiary: z.ZodString;
    url: z.ZodEffects<z.ZodString, string, string>;
    active: z.ZodOptional<z.ZodBoolean>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    title: string;
    url: string;
    purpose: "OTHER" | "MAINTENANCE" | "WORKS" | "CHARITY" | "SPECIAL";
    beneficiary: string;
    active?: boolean | undefined;
    description?: string | null | undefined;
    sortOrder?: number | undefined;
}, {
    title: string;
    url: string;
    purpose: "OTHER" | "MAINTENANCE" | "WORKS" | "CHARITY" | "SPECIAL";
    beneficiary: string;
    active?: boolean | undefined;
    description?: unknown;
    sortOrder?: number | undefined;
}>;
export declare const bulletinSchema: z.ZodObject<{
    title: z.ZodString;
    weekOf: z.ZodString;
    body: z.ZodString;
    includeSchedule: z.ZodOptional<z.ZodBoolean>;
    includeEvents: z.ZodOptional<z.ZodBoolean>;
    includeCampaigns: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    title: string;
    weekOf: string;
    body: string;
    includeSchedule?: boolean | undefined;
    includeEvents?: boolean | undefined;
    includeCampaigns?: boolean | undefined;
}, {
    title: string;
    weekOf: string;
    body: string;
    includeSchedule?: boolean | undefined;
    includeEvents?: boolean | undefined;
    includeCampaigns?: boolean | undefined;
}>;
export declare const bulletinPublishSchema: z.ZodObject<{
    sendEmail: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    sendEmail: boolean;
}, {
    sendEmail?: boolean | undefined;
}>;
export declare const followPreferencesSchema: z.ZodObject<{
    bulletinEmail: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    bulletinEmail: boolean;
}, {
    bulletinEmail: boolean;
}>;
export declare const CERTIFICATE_TYPES: readonly ["BAPTISM", "CONFIRMATION", "MARRIAGE"];
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];
export declare const CERTIFICATE_TYPE_LABEL: Record<CertificateType, string>;
export declare const CERTIFICATE_STATUSES: readonly ["RECEIVED", "IN_REVIEW", "NEEDS_INFO", "READY", "DELIVERED", "REJECTED"];
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];
export declare const CERTIFICATE_STATUS_LABEL: Record<CertificateStatus, string>;
/** Transiciones permitidas (DELIVERED y REJECTED son finales). */
export declare const CERTIFICATE_TRANSITIONS: Record<CertificateStatus, readonly CertificateStatus[]>;
export declare const certificateRequestSchema: z.ZodObject<{
    type: z.ZodEnum<["BAPTISM", "CONFIRMATION", "MARRIAGE"]>;
    requesterName: z.ZodString;
    requesterEmail: z.ZodString;
    requesterPhone: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    requesterDocument: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    subjectName: z.ZodString;
    subjectBirthDate: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    sacramentYear: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodNumber>>, number | null | undefined, unknown>;
    sacramentPlace: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    parentsNames: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    spouseName: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    purpose: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    details: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    /** Confirmación expresa del tratamiento de datos para esta solicitud. */
    acceptPrivacy: z.ZodLiteral<true>;
    /** Trampa anti-spam: debe quedar vacío. */
    website: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    type: "BAPTISM" | "CONFIRMATION" | "MARRIAGE";
    requesterName: string;
    requesterEmail: string;
    subjectName: string;
    acceptPrivacy: true;
    purpose?: string | null | undefined;
    requesterPhone?: string | null | undefined;
    requesterDocument?: string | null | undefined;
    subjectBirthDate?: string | null | undefined;
    sacramentYear?: number | null | undefined;
    sacramentPlace?: string | null | undefined;
    parentsNames?: string | null | undefined;
    spouseName?: string | null | undefined;
    details?: string | null | undefined;
    website?: string | undefined;
}, {
    type: "BAPTISM" | "CONFIRMATION" | "MARRIAGE";
    requesterName: string;
    requesterEmail: string;
    subjectName: string;
    acceptPrivacy: true;
    purpose?: unknown;
    requesterPhone?: unknown;
    requesterDocument?: unknown;
    subjectBirthDate?: unknown;
    sacramentYear?: unknown;
    sacramentPlace?: unknown;
    parentsNames?: unknown;
    spouseName?: unknown;
    details?: unknown;
    website?: string | undefined;
}>;
export declare const certificateLookupSchema: z.ZodObject<{
    code: z.ZodString;
    email: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code: string;
    email: string;
}, {
    code: string;
    email: string;
}>;
export declare const certificateUpdateSchema: z.ZodEffects<z.ZodObject<{
    status: z.ZodEnum<["RECEIVED", "IN_REVIEW", "NEEDS_INFO", "READY", "DELIVERED", "REJECTED"]>;
    note: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    publicMessage: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    /** Entregar exige confirmar que se verificó la identidad y la autorización de quien retira. */
    identityVerified: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    status: "RECEIVED" | "IN_REVIEW" | "NEEDS_INFO" | "READY" | "DELIVERED" | "REJECTED";
    note?: string | null | undefined;
    publicMessage?: string | null | undefined;
    identityVerified?: boolean | undefined;
}, {
    status: "RECEIVED" | "IN_REVIEW" | "NEEDS_INFO" | "READY" | "DELIVERED" | "REJECTED";
    note?: unknown;
    publicMessage?: unknown;
    identityVerified?: boolean | undefined;
}>, {
    status: "RECEIVED" | "IN_REVIEW" | "NEEDS_INFO" | "READY" | "DELIVERED" | "REJECTED";
    note?: string | null | undefined;
    publicMessage?: string | null | undefined;
    identityVerified?: boolean | undefined;
}, {
    status: "RECEIVED" | "IN_REVIEW" | "NEEDS_INFO" | "READY" | "DELIVERED" | "REJECTED";
    note?: unknown;
    publicMessage?: unknown;
    identityVerified?: boolean | undefined;
}>;
export declare const INVENTORY_CATEGORIES: readonly ["FURNITURE", "IT", "SOUND", "INSTRUMENT", "CATECHESIS", "LITURGICAL", "OTHER"];
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];
export declare const INVENTORY_CATEGORY_LABEL: Record<InventoryCategory, string>;
export declare const INVENTORY_CONDITIONS: readonly ["NEW", "GOOD", "FAIR", "POOR", "BROKEN"];
export type InventoryCondition = (typeof INVENTORY_CONDITIONS)[number];
export declare const INVENTORY_CONDITION_LABEL: Record<InventoryCondition, string>;
export declare const inventoryItemSchema: z.ZodObject<{
    name: z.ZodString;
    category: z.ZodEnum<["FURNITURE", "IT", "SOUND", "INSTRUMENT", "CATECHESIS", "LITURGICAL", "OTHER"]>;
    description: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    location: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    condition: z.ZodOptional<z.ZodEnum<["NEW", "GOOD", "FAIR", "POOR", "BROKEN"]>>;
    quantity: z.ZodOptional<z.ZodNumber>;
    acquiredAt: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    responsible: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
}, "strict", z.ZodTypeAny, {
    name: string;
    category: "CATECHESIS" | "OTHER" | "FURNITURE" | "IT" | "SOUND" | "INSTRUMENT" | "LITURGICAL";
    location?: string | null | undefined;
    notes?: string | null | undefined;
    description?: string | null | undefined;
    condition?: "NEW" | "GOOD" | "FAIR" | "POOR" | "BROKEN" | undefined;
    quantity?: number | undefined;
    acquiredAt?: string | null | undefined;
    responsible?: string | null | undefined;
}, {
    name: string;
    category: "CATECHESIS" | "OTHER" | "FURNITURE" | "IT" | "SOUND" | "INSTRUMENT" | "LITURGICAL";
    location?: unknown;
    notes?: unknown;
    description?: unknown;
    condition?: "NEW" | "GOOD" | "FAIR" | "POOR" | "BROKEN" | undefined;
    quantity?: number | undefined;
    acquiredAt?: unknown;
    responsible?: unknown;
}>;
export declare const inventoryQuerySchema: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodEnum<["FURNITURE", "IT", "SOUND", "INSTRUMENT", "CATECHESIS", "LITURGICAL", "OTHER"]>>;
    condition: z.ZodOptional<z.ZodEnum<["NEW", "GOOD", "FAIR", "POOR", "BROKEN"]>>;
    archived: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
}, "strip", z.ZodTypeAny, {
    category?: "CATECHESIS" | "OTHER" | "FURNITURE" | "IT" | "SOUND" | "INSTRUMENT" | "LITURGICAL" | undefined;
    condition?: "NEW" | "GOOD" | "FAIR" | "POOR" | "BROKEN" | undefined;
    q?: string | undefined;
    archived?: "true" | "false" | undefined;
}, {
    category?: "CATECHESIS" | "OTHER" | "FURNITURE" | "IT" | "SOUND" | "INSTRUMENT" | "LITURGICAL" | undefined;
    condition?: "NEW" | "GOOD" | "FAIR" | "POOR" | "BROKEN" | undefined;
    q?: string | undefined;
    archived?: "true" | "false" | undefined;
}>;
export declare const PASTORAL_GROUP_KINDS: readonly ["CATECHESIS", "READERS", "MINISTERS", "VOLUNTEERS", "YOUTH", "LITURGY", "CHOIR", "OTHER"];
export type PastoralGroupKind = (typeof PASTORAL_GROUP_KINDS)[number];
export declare const PASTORAL_GROUP_KIND_LABEL: Record<PastoralGroupKind, string>;
export declare const pastoralGroupSchema: z.ZodObject<{
    name: z.ZodString;
    kind: z.ZodEnum<["CATECHESIS", "READERS", "MINISTERS", "VOLUNTEERS", "YOUTH", "LITURGY", "CHOIR", "OTHER"]>;
    description: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    leaders: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    active: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    kind: "CATECHESIS" | "OTHER" | "READERS" | "MINISTERS" | "VOLUNTEERS" | "YOUTH" | "LITURGY" | "CHOIR";
    name: string;
    active?: boolean | undefined;
    description?: string | null | undefined;
    leaders?: string | null | undefined;
}, {
    kind: "CATECHESIS" | "OTHER" | "READERS" | "MINISTERS" | "VOLUNTEERS" | "YOUTH" | "LITURGY" | "CHOIR";
    name: string;
    active?: boolean | undefined;
    description?: unknown;
    leaders?: unknown;
}>;
export declare const groupMemberSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    phone: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    email: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    role: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    isMinor: z.ZodOptional<z.ZodBoolean>;
    guardianName: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    guardianPhone: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    active: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    name: string;
    active?: boolean | undefined;
    email?: string | null | undefined;
    phone?: string | null | undefined;
    role?: string | null | undefined;
    isMinor?: boolean | undefined;
    guardianName?: string | null | undefined;
    guardianPhone?: string | null | undefined;
}, {
    name: string;
    active?: boolean | undefined;
    email?: unknown;
    phone?: unknown;
    role?: unknown;
    isMinor?: boolean | undefined;
    guardianName?: unknown;
    guardianPhone?: unknown;
}>, {
    name: string;
    active?: boolean | undefined;
    email?: string | null | undefined;
    phone?: string | null | undefined;
    role?: string | null | undefined;
    isMinor?: boolean | undefined;
    guardianName?: string | null | undefined;
    guardianPhone?: string | null | undefined;
}, {
    name: string;
    active?: boolean | undefined;
    email?: unknown;
    phone?: unknown;
    role?: unknown;
    isMinor?: boolean | undefined;
    guardianName?: unknown;
    guardianPhone?: unknown;
}>;
export declare const groupMeetingSchema: z.ZodObject<{
    date: z.ZodString;
    topic: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
}, "strict", z.ZodTypeAny, {
    date: string;
    notes?: string | null | undefined;
    topic?: string | null | undefined;
}, {
    date: string;
    notes?: unknown;
    topic?: unknown;
}>;
export declare const attendanceSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        memberId: z.ZodString;
        present: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        memberId: string;
        present: boolean;
    }, {
        memberId: string;
        present: boolean;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    items: {
        memberId: string;
        present: boolean;
    }[];
}, {
    items: {
        memberId: string;
        present: boolean;
    }[];
}>;
