import { z } from "zod";
export declare const ROLES: readonly ["SUPERADMIN", "ADMIN", "OPERATOR"];
export type Role = (typeof ROLES)[number];
export type AccountType = "STAFF" | "PILGRIM";
/** DRAFT: en preparación, no operativo · SCHEDULED: programado · IN_PROGRESS: activo · FINISHED: cerrado · CANCELLED: cancelado. */
export declare const EVENT_STATUSES: readonly ["DRAFT", "SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELLED"];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export declare const EVENT_STATUS_LABEL: Record<EventStatus, string>;
/** Estados en los que el evento no admite operación (llegadas, altas desde inscripciones). */
export declare const isEventOperable: (s: EventStatus) => s is "SCHEDULED" | "IN_PROGRESS";
export declare const EVENT_TYPES: readonly ["PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY", "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER"];
export type EventType = (typeof EVENT_TYPES)[number];
/** Qué habilita cada tipo. hasRoute: admite trayecto (EventRoute) y la gestión de recorrido. */
export declare const EVENT_TYPE_INFO: Record<EventType, {
    label: string;
    hasRoute: boolean;
}>;
export declare const EVENT_VISIBILITIES: readonly ["PRIVATE", "UNLISTED", "PUBLIC"];
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];
export declare const EVENT_VISIBILITY_LABEL: Record<EventVisibility, string>;
export type Permission = "event:read" | "event:create" | "event:update" | "user:manage" | "assignment:manage" | "participant:read" | "participant:create" | "participant:manage" | "checkpoint:read" | "checkpoint:manage" | "checkin:create" | "checkin:read" | "checkin:correct" | "report:read" | "export:run" | "backup:run" | "audit:read" | "contact:manage" | "invitation:manage" | "payment:review" | "credential:export";
export declare const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>>;
export declare function can(role: Role, permission: Permission): boolean;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const registerPilgrimSchema: z.ZodObject<{
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodString;
    documentNumber: z.ZodString;
    phone: z.ZodString;
    password: z.ZodString;
    acceptTerms: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    phone: string;
    acceptTerms: true;
}, {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    phone: string;
    acceptTerms: true;
}>;
export declare const bootstrapSchema: z.ZodObject<{
    organizationName: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    organizationName: string;
    name: string;
}, {
    email: string;
    password: string;
    organizationName: string;
    name: string;
}>;
/** Trayecto (origen → destino). Solo para tipos con EVENT_TYPE_INFO[type].hasRoute. */
export declare const eventRouteSchema: z.ZodObject<{
    originName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    originAddress: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    originLat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    originLng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    destinationName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    destinationAddress: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    destinationLat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    destinationLng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    distanceKm: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    originName?: string | null | undefined;
    originAddress?: string | null | undefined;
    originLat?: number | null | undefined;
    originLng?: number | null | undefined;
    destinationName?: string | null | undefined;
    destinationAddress?: string | null | undefined;
    destinationLat?: number | null | undefined;
    destinationLng?: number | null | undefined;
    distanceKm?: number | null | undefined;
}, {
    originName?: string | null | undefined;
    originAddress?: string | null | undefined;
    originLat?: number | null | undefined;
    originLng?: number | null | undefined;
    destinationName?: string | null | undefined;
    destinationAddress?: string | null | undefined;
    destinationLat?: number | null | undefined;
    destinationLng?: number | null | undefined;
    distanceKm?: number | null | undefined;
}>;
export type EventRouteInput = z.infer<typeof eventRouteSchema>;
export declare const eventSettingsSchemas: Record<EventType, z.ZodTypeAny>;
/** Sin `type` se asume OTHER (compatibilidad con clientes que aún no lo envían). */
export declare const createEventSchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY", "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER"]>>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    startsAt: z.ZodDate;
    endsAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    timezone: z.ZodDefault<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["DRAFT", "SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELLED"]>>;
    /** Nombre de la parroquia que se imprime en la credencial. */
    parishName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    locationName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    latitude: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    longitude: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    capacity: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    visibility: z.ZodOptional<z.ZodEnum<["PRIVATE", "UNLISTED", "PUBLIC"]>>;
    registrationOpen: z.ZodOptional<z.ZodBoolean>;
    registrationOpensAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    registrationClosesAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    registrationFee: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    paymentInstructions: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    certificateEnabled: z.ZodOptional<z.ZodBoolean>;
    certificatePhrase: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    /** null quita el trayecto. */
    route: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        originName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        originAddress: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        originLat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        originLng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        destinationName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        destinationAddress: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        destinationLat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        destinationLng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        distanceKm: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        originName?: string | null | undefined;
        originAddress?: string | null | undefined;
        originLat?: number | null | undefined;
        originLng?: number | null | undefined;
        destinationName?: string | null | undefined;
        destinationAddress?: string | null | undefined;
        destinationLat?: number | null | undefined;
        destinationLng?: number | null | undefined;
        distanceKm?: number | null | undefined;
    }, {
        originName?: string | null | undefined;
        originAddress?: string | null | undefined;
        originLat?: number | null | undefined;
        originLng?: number | null | undefined;
        destinationName?: string | null | undefined;
        destinationAddress?: string | null | undefined;
        destinationLat?: number | null | undefined;
        destinationLng?: number | null | undefined;
        distanceKm?: number | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    type: "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY" | "OTHER";
    status: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED";
    name: string;
    startsAt: Date;
    timezone: string;
    description?: string | undefined;
    endsAt?: Date | null | undefined;
    parishName?: string | null | undefined;
    locationName?: string | null | undefined;
    address?: string | null | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    capacity?: number | null | undefined;
    visibility?: "PRIVATE" | "UNLISTED" | "PUBLIC" | undefined;
    registrationOpen?: boolean | undefined;
    registrationOpensAt?: Date | null | undefined;
    registrationClosesAt?: Date | null | undefined;
    registrationFee?: number | null | undefined;
    paymentInstructions?: string | null | undefined;
    certificateEnabled?: boolean | undefined;
    certificatePhrase?: string | null | undefined;
    settings?: Record<string, unknown> | undefined;
    route?: {
        originName?: string | null | undefined;
        originAddress?: string | null | undefined;
        originLat?: number | null | undefined;
        originLng?: number | null | undefined;
        destinationName?: string | null | undefined;
        destinationAddress?: string | null | undefined;
        destinationLat?: number | null | undefined;
        destinationLng?: number | null | undefined;
        distanceKm?: number | null | undefined;
    } | null | undefined;
}, {
    name: string;
    startsAt: Date;
    type?: "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY" | "OTHER" | undefined;
    status?: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED" | undefined;
    description?: string | undefined;
    endsAt?: Date | null | undefined;
    timezone?: string | undefined;
    parishName?: string | null | undefined;
    locationName?: string | null | undefined;
    address?: string | null | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    capacity?: number | null | undefined;
    visibility?: "PRIVATE" | "UNLISTED" | "PUBLIC" | undefined;
    registrationOpen?: boolean | undefined;
    registrationOpensAt?: Date | null | undefined;
    registrationClosesAt?: Date | null | undefined;
    registrationFee?: number | null | undefined;
    paymentInstructions?: string | null | undefined;
    certificateEnabled?: boolean | undefined;
    certificatePhrase?: string | null | undefined;
    settings?: Record<string, unknown> | undefined;
    route?: {
        originName?: string | null | undefined;
        originAddress?: string | null | undefined;
        originLat?: number | null | undefined;
        originLng?: number | null | undefined;
        destinationName?: string | null | undefined;
        destinationAddress?: string | null | undefined;
        destinationLat?: number | null | undefined;
        destinationLng?: number | null | undefined;
        distanceKm?: number | null | undefined;
    } | null | undefined;
}>;
export declare const updateEventSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    type: z.ZodOptional<z.ZodEnum<["PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY", "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER"]>>;
    startsAt: z.ZodOptional<z.ZodDate>;
    endsAt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    timezone: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["DRAFT", "SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELLED"]>>>;
    parishName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    locationName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    latitude: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    longitude: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    capacity: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    visibility: z.ZodOptional<z.ZodOptional<z.ZodEnum<["PRIVATE", "UNLISTED", "PUBLIC"]>>>;
    registrationOpen: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    registrationOpensAt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    registrationClosesAt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    registrationFee: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    paymentInstructions: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    certificateEnabled: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    certificatePhrase: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    settings: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    route: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodObject<{
        originName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        originAddress: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        originLat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        originLng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        destinationName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        destinationAddress: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        destinationLat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        destinationLng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        distanceKm: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        originName?: string | null | undefined;
        originAddress?: string | null | undefined;
        originLat?: number | null | undefined;
        originLng?: number | null | undefined;
        destinationName?: string | null | undefined;
        destinationAddress?: string | null | undefined;
        destinationLat?: number | null | undefined;
        destinationLng?: number | null | undefined;
        distanceKm?: number | null | undefined;
    }, {
        originName?: string | null | undefined;
        originAddress?: string | null | undefined;
        originLat?: number | null | undefined;
        originLng?: number | null | undefined;
        destinationName?: string | null | undefined;
        destinationAddress?: string | null | undefined;
        destinationLat?: number | null | undefined;
        destinationLng?: number | null | undefined;
        distanceKm?: number | null | undefined;
    }>>>>;
}, "strip", z.ZodTypeAny, {
    type?: "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY" | "OTHER" | undefined;
    status?: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED" | undefined;
    name?: string | undefined;
    description?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | null | undefined;
    timezone?: string | undefined;
    parishName?: string | null | undefined;
    locationName?: string | null | undefined;
    address?: string | null | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    capacity?: number | null | undefined;
    visibility?: "PRIVATE" | "UNLISTED" | "PUBLIC" | undefined;
    registrationOpen?: boolean | undefined;
    registrationOpensAt?: Date | null | undefined;
    registrationClosesAt?: Date | null | undefined;
    registrationFee?: number | null | undefined;
    paymentInstructions?: string | null | undefined;
    certificateEnabled?: boolean | undefined;
    certificatePhrase?: string | null | undefined;
    settings?: Record<string, unknown> | undefined;
    route?: {
        originName?: string | null | undefined;
        originAddress?: string | null | undefined;
        originLat?: number | null | undefined;
        originLng?: number | null | undefined;
        destinationName?: string | null | undefined;
        destinationAddress?: string | null | undefined;
        destinationLat?: number | null | undefined;
        destinationLng?: number | null | undefined;
        distanceKm?: number | null | undefined;
    } | null | undefined;
}, {
    type?: "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY" | "OTHER" | undefined;
    status?: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED" | undefined;
    name?: string | undefined;
    description?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | null | undefined;
    timezone?: string | undefined;
    parishName?: string | null | undefined;
    locationName?: string | null | undefined;
    address?: string | null | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    capacity?: number | null | undefined;
    visibility?: "PRIVATE" | "UNLISTED" | "PUBLIC" | undefined;
    registrationOpen?: boolean | undefined;
    registrationOpensAt?: Date | null | undefined;
    registrationClosesAt?: Date | null | undefined;
    registrationFee?: number | null | undefined;
    paymentInstructions?: string | null | undefined;
    certificateEnabled?: boolean | undefined;
    certificatePhrase?: string | null | undefined;
    settings?: Record<string, unknown> | undefined;
    route?: {
        originName?: string | null | undefined;
        originAddress?: string | null | undefined;
        originLat?: number | null | undefined;
        originLng?: number | null | undefined;
        destinationName?: string | null | undefined;
        destinationAddress?: string | null | undefined;
        destinationLat?: number | null | undefined;
        destinationLng?: number | null | undefined;
        distanceKm?: number | null | undefined;
    } | null | undefined;
}>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export declare const eventListQuerySchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodEnum<["PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY", "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER"]>>;
    status: z.ZodOptional<z.ZodEnum<["DRAFT", "SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELLED"]>>;
}, "strip", z.ZodTypeAny, {
    type?: "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY" | "OTHER" | undefined;
    status?: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED" | undefined;
}, {
    type?: "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY" | "OTHER" | undefined;
    status?: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED" | undefined;
}>;
/**
 * Reglas entre campos sobre el estado final del evento (ya combinado con lo guardado).
 * Devuelve la lista de problemas; vacía si todo es coherente.
 */
export declare function validateEventCoherence(e: {
    type: EventType;
    startsAt: Date;
    endsAt?: Date | null;
    registrationOpensAt?: Date | null;
    registrationClosesAt?: Date | null;
    settings?: unknown;
    hasRoute: boolean;
    latitude?: number | null;
    longitude?: number | null;
}): {
    field: string;
    message: string;
}[];
/** Inscripción abierta ahora: interruptor + estado operable + ventana opcional. */
export declare function isRegistrationOpenNow(e: {
    registrationOpen: boolean;
    status: EventStatus;
    registrationOpensAt?: Date | null;
    registrationClosesAt?: Date | null;
}, now?: Date): boolean;
export declare const createUserSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodEnum<["SUPERADMIN", "ADMIN", "OPERATOR"]>;
    extraPermissions: z.ZodDefault<z.ZodArray<z.ZodEnum<["participant:create", "checkin:read", "report:read"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    name: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    extraPermissions: ("participant:create" | "checkin:read" | "report:read")[];
}, {
    email: string;
    password: string;
    name: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    extraPermissions?: ("participant:create" | "checkin:read" | "report:read")[] | undefined;
}>;
export declare const updateUserSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodEnum<["SUPERADMIN", "ADMIN", "OPERATOR"]>>;
    isActive: z.ZodOptional<z.ZodBoolean>;
    password: z.ZodOptional<z.ZodString>;
    extraPermissions: z.ZodOptional<z.ZodArray<z.ZodEnum<["participant:create", "checkin:read", "report:read"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    password?: string | undefined;
    name?: string | undefined;
    role?: "SUPERADMIN" | "ADMIN" | "OPERATOR" | undefined;
    extraPermissions?: ("participant:create" | "checkin:read" | "report:read")[] | undefined;
    isActive?: boolean | undefined;
}, {
    password?: string | undefined;
    name?: string | undefined;
    role?: "SUPERADMIN" | "ADMIN" | "OPERATOR" | undefined;
    extraPermissions?: ("participant:create" | "checkin:read" | "report:read")[] | undefined;
    isActive?: boolean | undefined;
}>;
export declare const assignmentsSchema: z.ZodObject<{
    checkpointIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    checkpointIds: string[];
}, {
    checkpointIds: string[];
}>;
export declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
export interface SessionUser {
    id: string;
    name: string;
    email: string;
    role: Role;
    organizationId: string;
}
export interface AssignmentView {
    checkpointId: string;
    checkpointName: string;
    order: number;
    eventId: string;
    eventName: string;
    eventStatus: EventStatus;
}
export interface MeResponse {
    user: SessionUser;
    /** Permisos efectivos (rol + permisos extra): la interfaz los usa para mostrar u ocultar opciones. */
    permissions: Permission[];
    assignments: AssignmentView[];
    /** Punto de control actual (solo operadores): se abre directo en "Registrar llegada". */
    currentCheckpoint: AssignmentView | null;
}
/** Número visible con ceros: 1 -> "001" */
export declare const formatParticipantNumber: (n: number) => string;
export declare const PARTICIPANT_STATUSES: readonly ["ACTIVE", "INACTIVE", "CANCELLED"];
export declare const CHECKIN_METHODS: readonly ["NUMBER", "QR", "SEARCH"];
export type CheckinMethod = (typeof CHECKIN_METHODS)[number];
/** Prefijo del contenido del QR: "PG1:<token opaco>". Nunca lleva datos personales. */
export declare const QR_PREFIX = "PG1:";
export declare const qrContent: (token: string) => string;
export declare const parseQrContent: (raw: string) => string | null;
export declare const normalizeDocument: (s: string) => string;
export declare const digitsOnly: (s: string) => string;
export declare const createParticipantSchema: z.ZodObject<{
    firstName: z.ZodString;
    lastName: z.ZodString;
    documentNumber: z.ZodEffects<z.ZodString, string, string>;
    phone: z.ZodEffects<z.ZodString, string, string>;
    documentType: z.ZodDefault<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    number: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    firstName: string;
    lastName: string;
    documentNumber: string;
    phone: string;
    documentType: string;
    number?: number | undefined;
    notes?: string | undefined;
}, {
    firstName: string;
    lastName: string;
    documentNumber: string;
    phone: string;
    number?: number | undefined;
    documentType?: string | undefined;
    notes?: string | undefined;
}>;
export declare const updateParticipantSchema: z.ZodObject<{
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    documentNumber: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    phone: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    documentType: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    number: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
} & {
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "INACTIVE", "CANCELLED"]>>;
}, "strip", z.ZodTypeAny, {
    number?: number | undefined;
    status?: "CANCELLED" | "ACTIVE" | "INACTIVE" | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    phone?: string | undefined;
    documentType?: string | undefined;
    notes?: string | undefined;
}, {
    number?: number | undefined;
    status?: "CANCELLED" | "ACTIVE" | "INACTIVE" | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    phone?: string | undefined;
    documentType?: string | undefined;
    notes?: string | undefined;
}>;
export declare const participantListSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    q: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "INACTIVE", "CANCELLED"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "CANCELLED" | "ACTIVE" | "INACTIVE" | undefined;
    q?: string | undefined;
}, {
    status?: "CANCELLED" | "ACTIVE" | "INACTIVE" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
export declare const createCheckpointSchema: z.ZodObject<{
    latitude: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    longitude: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
    reference: z.ZodOptional<z.ZodString>;
    capacity: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    status: z.ZodDefault<z.ZodEnum<["ACTIVE", "INACTIVE"]>>;
}, "strip", z.ZodTypeAny, {
    status: "ACTIVE" | "INACTIVE";
    name: string;
    description?: string | undefined;
    address?: string | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    capacity?: number | null | undefined;
    reference?: string | undefined;
}, {
    name: string;
    status?: "ACTIVE" | "INACTIVE" | undefined;
    description?: string | undefined;
    address?: string | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    capacity?: number | null | undefined;
    reference?: string | undefined;
}>;
export declare const updateCheckpointSchema: z.ZodObject<{
    latitude: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    longitude: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    reference: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    capacity: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["ACTIVE", "INACTIVE"]>>>;
}, "strip", z.ZodTypeAny, {
    status?: "ACTIVE" | "INACTIVE" | undefined;
    name?: string | undefined;
    description?: string | undefined;
    address?: string | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    capacity?: number | null | undefined;
    reference?: string | undefined;
}, {
    status?: "ACTIVE" | "INACTIVE" | undefined;
    name?: string | undefined;
    description?: string | undefined;
    address?: string | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    capacity?: number | null | undefined;
    reference?: string | undefined;
}>;
export declare const reorderCheckpointsSchema: z.ZodObject<{
    checkpointIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    checkpointIds: string[];
}, {
    checkpointIds: string[];
}>;
export declare const createCheckinSchema: z.ZodObject<{
    /** UUID generado por el dispositivo: hace idempotente el envío. */
    id: z.ZodOptional<z.ZodString>;
    participantId: z.ZodString;
    checkpointId: z.ZodString;
    method: z.ZodEnum<["NUMBER", "QR", "SEARCH"]>;
    timestamp: z.ZodOptional<z.ZodDate>;
    latitude: z.ZodOptional<z.ZodNumber>;
    longitude: z.ZodOptional<z.ZodNumber>;
    deviceId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    participantId: string;
    checkpointId: string;
    method: "NUMBER" | "QR" | "SEARCH";
    latitude?: number | undefined;
    longitude?: number | undefined;
    id?: string | undefined;
    timestamp?: Date | undefined;
    deviceId?: string | undefined;
}, {
    participantId: string;
    checkpointId: string;
    method: "NUMBER" | "QR" | "SEARCH";
    latitude?: number | undefined;
    longitude?: number | undefined;
    id?: string | undefined;
    timestamp?: Date | undefined;
    deviceId?: string | undefined;
}>;
export declare const cancelCheckinSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare const correctCheckinSchema: z.ZodEffects<z.ZodObject<{
    reason: z.ZodString;
    timestamp: z.ZodOptional<z.ZodDate>;
    checkpointId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    checkpointId?: string | undefined;
    timestamp?: Date | undefined;
}, {
    reason: string;
    checkpointId?: string | undefined;
    timestamp?: Date | undefined;
}>, {
    reason: string;
    checkpointId?: string | undefined;
    timestamp?: Date | undefined;
}, {
    reason: string;
    checkpointId?: string | undefined;
    timestamp?: Date | undefined;
}>;
export declare const resolveConflictSchema: z.ZodObject<{
    action: z.ZodEnum<["KEEP_ORIGINAL", "USE_THIS"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "KEEP_ORIGINAL" | "USE_THIS";
    reason?: string | undefined;
}, {
    action: "KEEP_ORIGINAL" | "USE_THIS";
    reason?: string | undefined;
}>;
export declare const checkinListSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    checkpointId: z.ZodOptional<z.ZodString>;
    participantId: z.ZodOptional<z.ZodString>;
    operatorId: z.ZodOptional<z.ZodString>;
    method: z.ZodOptional<z.ZodEnum<["NUMBER", "QR", "SEARCH"]>>;
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "CANCELLED", "CONFLICT"]>>;
    from: z.ZodOptional<z.ZodDate>;
    to: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "CANCELLED" | "ACTIVE" | "CONFLICT" | undefined;
    participantId?: string | undefined;
    checkpointId?: string | undefined;
    method?: "NUMBER" | "QR" | "SEARCH" | undefined;
    operatorId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
}, {
    status?: "CANCELLED" | "ACTIVE" | "CONFLICT" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    participantId?: string | undefined;
    checkpointId?: string | undefined;
    method?: "NUMBER" | "QR" | "SEARCH" | undefined;
    operatorId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
}>;
/** Permisos que un administrador puede activar individualmente a un operador. */
export declare const GRANTABLE_PERMISSIONS: readonly ["participant:create", "checkin:read", "report:read"];
export type GrantablePermission = (typeof GRANTABLE_PERMISSIONS)[number];
export declare function effectivePermissions(role: Role, extras?: readonly string[]): Permission[];
export declare const hasPermission: (role: Role, extras: readonly string[], p: Permission) => boolean;
/** Nadie puede dar un nivel superior al suyo: el Superadmin da cualquiera; el Administrador solo nivel operador. */
export declare const canGrantRole: (granter: Role, target: Role) => boolean;
/** Niveles listos para elegir al invitar. */
export declare const ACCESS_LEVELS: readonly [{
    readonly id: "OPERATOR_POINT";
    readonly label: "Operador de punto";
    readonly description: "Solo chequea llegadas en sus puntos";
    readonly role: Role;
    readonly extraPermissions: GrantablePermission[];
}, {
    readonly id: "OPERATOR_PLUS";
    readonly label: "Operador con altas";
    readonly description: "Chequea llegadas y agrega participantes";
    readonly role: Role;
    readonly extraPermissions: GrantablePermission[];
}, {
    readonly id: "ADMIN";
    readonly label: "Administrador";
    readonly description: "Gestiona personas, puntos, historial y reportes";
    readonly role: Role;
    readonly extraPermissions: GrantablePermission[];
}, {
    readonly id: "SUPERADMIN";
    readonly label: "Superadministrador";
    readonly description: "Acceso total, incluidos usuarios y eventos";
    readonly role: Role;
    readonly extraPermissions: GrantablePermission[];
}];
export declare const createInvitationSchema: z.ZodEffects<z.ZodObject<{
    email: z.ZodString;
    role: z.ZodEnum<["SUPERADMIN", "ADMIN", "OPERATOR"]>;
    extraPermissions: z.ZodDefault<z.ZodArray<z.ZodEnum<["participant:create", "checkin:read", "report:read"]>, "many">>;
    checkpointIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    email: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    extraPermissions: ("participant:create" | "checkin:read" | "report:read")[];
    checkpointIds: string[];
}, {
    email: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    extraPermissions?: ("participant:create" | "checkin:read" | "report:read")[] | undefined;
    checkpointIds?: string[] | undefined;
}>, {
    email: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    extraPermissions: ("participant:create" | "checkin:read" | "report:read")[];
    checkpointIds: string[];
}, {
    email: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    extraPermissions?: ("participant:create" | "checkin:read" | "report:read")[] | undefined;
    checkpointIds?: string[] | undefined;
}>;
export declare const acceptInvitationSchema: z.ZodObject<{
    token: z.ZodString;
    name: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
    name: string;
    token: string;
}, {
    password: string;
    name: string;
    token: string;
}>;
export declare const pilgrimLoginSchema: z.ZodEffects<z.ZodObject<{
    token: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code?: string | undefined;
    token?: string | undefined;
}, {
    code?: string | undefined;
    token?: string | undefined;
}>, {
    code?: string | undefined;
    token?: string | undefined;
}, {
    code?: string | undefined;
    token?: string | undefined;
}>;
export declare const issueAccessSchema: z.ZodObject<{
    participantIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** false: solo a quienes aún no tienen acceso. true: reemite (el enlace anterior deja de funcionar). */
    reissue: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    reissue: boolean;
    participantIds?: string[] | undefined;
}, {
    participantIds?: string[] | undefined;
    reissue?: boolean | undefined;
}>;
export declare const createContactSchema: z.ZodObject<{
    name: z.ZodString;
    roleLabel: z.ZodOptional<z.ZodString>;
    phone: z.ZodString;
    email: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    checkpointId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isEmergency: z.ZodDefault<z.ZodBoolean>;
    sortOrder: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    phone: string;
    name: string;
    isEmergency: boolean;
    sortOrder: number;
    email?: string | undefined;
    notes?: string | undefined;
    checkpointId?: string | null | undefined;
    roleLabel?: string | undefined;
}, {
    phone: string;
    name: string;
    email?: string | undefined;
    notes?: string | undefined;
    checkpointId?: string | null | undefined;
    roleLabel?: string | undefined;
    isEmergency?: boolean | undefined;
    sortOrder?: number | undefined;
}>;
export declare const updateContactSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    roleLabel: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    checkpointId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    isEmergency: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sortOrder: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    phone?: string | undefined;
    name?: string | undefined;
    notes?: string | undefined;
    checkpointId?: string | null | undefined;
    roleLabel?: string | undefined;
    isEmergency?: boolean | undefined;
    sortOrder?: number | undefined;
}, {
    email?: string | undefined;
    phone?: string | undefined;
    name?: string | undefined;
    notes?: string | undefined;
    checkpointId?: string | null | undefined;
    roleLabel?: string | undefined;
    isEmergency?: boolean | undefined;
    sortOrder?: number | undefined;
}>;
export interface PilgrimMe {
    stage: "OFFICIAL";
    participant: {
        number: number;
        firstName: string;
        lastName: string;
        documentMasked: string;
    };
    /** Contenido exacto del QR ("PG1:<token>"). */
    qrContent: string;
    event: {
        id: string;
        name: string;
        description: string | null;
        startsAt: string;
        status: EventStatus;
        timezone: string;
        type: EventType;
        endsAt: string | null;
        locationName: string | null;
        address: string | null;
    };
    route: {
        checkpointId: string;
        order: number;
        name: string;
        address: string | null;
        reference: string | null;
        latitude: number | null;
        longitude: number | null;
        arrived: boolean;
        timestamp: string | null;
    }[];
    progress: {
        done: number;
        total: number;
        percent: number;
    };
    contacts: {
        id: string;
        name: string;
        roleLabel: string | null;
        phone: string;
        email: string | null;
        notes: string | null;
        isEmergency: boolean;
        checkpointName: string | null;
    }[];
}
export type SessionResponse = {
    kind: "staff";
    me: MeResponse;
} | {
    kind: "pilgrim";
} | {
    kind: "none";
};
/** Booleano de query string: "true"/"1" => true. (z.coerce.boolean convertiría "false" y "0" en true.) */
export declare const qBool: z.ZodEffects<z.ZodDefault<z.ZodEnum<["true", "false", "1", "0"]>>, boolean, "0" | "1" | "true" | "false" | undefined>;
export declare const REGISTRATION_STATUSES: readonly ["PENDING_PROOF", "IN_REVIEW", "APPROVED", "REJECTED", "CANCELLED"];
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];
export declare const createRegistrationSchema: z.ZodObject<{
    token: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    documentNumber: z.ZodEffects<z.ZodString, string, string>;
    phone: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    firstName: string;
    lastName: string;
    documentNumber: string;
    phone: string;
    token: string;
}, {
    firstName: string;
    lastName: string;
    documentNumber: string;
    phone: string;
    token: string;
}>;
export declare const proofFieldsSchema: z.ZodObject<{
    amount: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
    reference: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    paidAt: z.ZodEffects<z.ZodOptional<z.ZodDate>, Date | undefined, unknown>;
    note: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    reference?: string | undefined;
    amount?: number | undefined;
    paidAt?: Date | undefined;
    note?: string | undefined;
}, {
    reference?: unknown;
    amount?: unknown;
    paidAt?: unknown;
    note?: unknown;
}>;
export declare const registrationListSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    status: z.ZodOptional<z.ZodEnum<["PENDING_PROOF", "IN_REVIEW", "APPROVED", "REJECTED", "CANCELLED"]>>;
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "CANCELLED" | "PENDING_PROOF" | "IN_REVIEW" | "APPROVED" | "REJECTED" | undefined;
    q?: string | undefined;
}, {
    status?: "CANCELLED" | "PENDING_PROOF" | "IN_REVIEW" | "APPROVED" | "REJECTED" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
export declare const approveRegistrationSchema: z.ZodObject<{
    /** Opcional: número a asignar. Si falta, se toma el siguiente libre. */
    number: z.ZodOptional<z.ZodNumber>;
    /** Para pagos en efectivo u otros casos sin comprobante. Queda en la auditoría. */
    withoutProof: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    withoutProof: boolean;
    number?: number | undefined;
}, {
    number?: number | undefined;
    withoutProof?: boolean | undefined;
}>;
export declare const rejectRegistrationSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare const credentialQuerySchema: z.ZodObject<{
    /** new: aún no impresas · all: todas las activas · ids: las indicadas en `ids`. */
    scope: z.ZodDefault<z.ZodEnum<["new", "all", "ids"]>>;
    ids: z.ZodOptional<z.ZodString>;
    includeName: z.ZodEffects<z.ZodDefault<z.ZodEnum<["true", "false", "1", "0"]>>, boolean, "0" | "1" | "true" | "false" | undefined>;
    /** Marca como impresas las credenciales exportadas. */
    mark: z.ZodEffects<z.ZodDefault<z.ZodEnum<["true", "false", "1", "0"]>>, boolean, "0" | "1" | "true" | "false" | undefined>;
    page: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    scope: "new" | "all" | "ids";
    includeName: boolean;
    mark: boolean;
    ids?: string | undefined;
}, {
    page?: number | undefined;
    ids?: string | undefined;
    scope?: "new" | "all" | "ids" | undefined;
    includeName?: "0" | "1" | "true" | "false" | undefined;
    mark?: "0" | "1" | "true" | "false" | undefined;
}>;
export interface PilgrimRegistrationMe {
    stage: "REGISTRATION";
    registration: {
        firstName: string;
        lastName: string;
        documentMasked: string;
        status: RegistrationStatus;
        rejectionReason: string | null;
        proofsSent: number;
        lastProofAt: string | null;
    };
    event: {
        id: string;
        name: string;
        parishName: string;
        startsAt: string;
        registrationFee: string | null;
        paymentInstructions: string | null;
        type: EventType;
        endsAt: string | null;
        locationName: string | null;
        address: string | null;
    };
    contacts: PilgrimMe["contacts"];
}
