import { z } from "zod";
export declare const ROLES: readonly ["SUPERADMIN", "ADMIN", "OPERATOR"];
export type Role = (typeof ROLES)[number];
/** STAFF: personal de una parroquia · PILGRIM: identidad del peregrino · PLATFORM: operador de plataforma (A3). */
export type AccountType = "STAFF" | "PILGRIM" | "PLATFORM";
export declare const ORGANIZATION_STATUSES: readonly ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "ARCHIVED"];
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
export declare const ORGANIZATION_STATUS_LABEL: Record<OrganizationStatus, string>;
/**
 * Ciclo de vida del evento (independiente del de la inscripción).
 * DRAFT: en preparación · SCHEDULED: publicado · IN_PROGRESS: en curso · FINISHED: finalizado · CANCELLED: cancelado.
 */
export declare const EVENT_STATUSES: readonly ["DRAFT", "SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELLED"];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export declare const EVENT_STATUS_LABEL: Record<EventStatus, string>;
/** A4: estados con los que se puede crear un evento (crear publicado = DRAFT → SCHEDULED en un paso). */
export declare const EVENT_INITIAL_STATUSES: readonly ["DRAFT", "SCHEDULED"];
/** A4: únicas transiciones permitidas. FINISHED y CANCELLED son terminales. */
export declare const EVENT_TRANSITIONS: Readonly<Record<EventStatus, readonly EventStatus[]>>;
export declare const canTransitionEvent: (from: EventStatus, to: EventStatus) => boolean;
export declare const EVENT_CAPABILITIES: readonly ["INFO", "LOCATION", "REGISTRATION", "PARTICIPANTS", "CHECKIN", "ROUTE", "POINTS", "CONTACTS", "CERTIFICATES", "VOLUNTEERS", "COMMUNICATIONS", "DOCUMENTS"];
export type EventCapability = (typeof EVENT_CAPABILITIES)[number];
/** Reservadas: el servidor las rechaza hasta que exista su módulo (también hay CHECK en la BD). A5.1 habilitó VOLUNTEERS. */
export declare const RESERVED_EVENT_CAPABILITIES: readonly ["COMMUNICATIONS", "DOCUMENTS"];
export type ImplementedEventCapability = Exclude<EventCapability, (typeof RESERVED_EVENT_CAPABILITIES)[number]>;
export declare const IMPLEMENTED_EVENT_CAPABILITIES: ImplementedEventCapability[];
/**
 * Valor inicial si el alta no indica capacidades: lo mismo que antes de A4 (todo lo implementado hasta A4).
 * VOLUNTEERS (A5.1) se activa por evento cuando se necesita; no forma parte del valor inicial.
 */
export declare const DEFAULT_EVENT_CAPABILITIES: readonly EventCapability[];
export declare const EVENT_CAPABILITY_LABEL: Record<EventCapability, string>;
/** Dependencias que impone el modelo de datos (también hay CHECK en la BD). */
export declare const EVENT_CAPABILITY_REQUIRES: Partial<Record<EventCapability, readonly EventCapability[]>>;
/** INFO siempre está: nombre y fecha son obligatorios en todo evento. */
export declare function validateEventCapabilities(caps: readonly EventCapability[]): {
    field: string;
    message: string;
}[];
export declare const hasEventCapability: (e: {
    capabilities: readonly string[];
}, c: EventCapability) => boolean;
/** Estados en los que el evento no admite operación (llegadas, altas desde inscripciones). */
export declare const isEventOperable: (s: EventStatus) => s is "SCHEDULED" | "IN_PROGRESS";
export declare const EVENT_TYPES: readonly ["PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY", "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER"];
export type EventType = (typeof EVENT_TYPES)[number];
/** Etiqueta de cada tipo. A4: el tipo ya no habilita módulos; eso lo deciden las capacidades del evento. */
export declare const EVENT_TYPE_INFO: Record<EventType, {
    label: string;
}>;
export declare const EVENT_VISIBILITIES: readonly ["PRIVATE", "UNLISTED", "PUBLIC"];
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];
export declare const EVENT_VISIBILITY_LABEL: Record<EventVisibility, string>;
export type Permission = "event:read" | "event:create" | "event:update" | "user:manage" | "assignment:manage" | "participant:read" | "participant:create" | "participant:manage" | "checkpoint:read" | "checkpoint:manage" | "checkin:create" | "checkin:read" | "checkin:correct" | "report:read" | "export:run" | "backup:run" | "audit:read" | "contact:manage" | "invitation:manage" | "payment:review" | "credential:export"
/** A5.1: gestionar voluntarios, equipos, zonas, funciones, turnos y asignaciones de los eventos de la organización. */
 | "volunteer:manage"
/** B5: herramientas parroquiales. Por defecto solo las tiene el SUPERADMIN; se otorgan una a una (PERMISSION_CATALOG). */
 | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage"
/** Avisos al personal de la parroquia: permiso propio, distinto de notice:send (seguidores) y de user:manage. */
 | "notice:staff";
export declare const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>>;
export declare function can(role: Role, permission: Permission): boolean;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strict", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
/** Reenvío de verificación y pedido de recuperación: solo el correo (la respuesta nunca revela si existe). */
export declare const accountEmailSchema: z.ZodObject<{
    email: z.ZodString;
}, "strict", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
/** Restablecer con el token del correo (llega en el cuerpo, nunca en la URL de la API). */
export declare const passwordResetConfirmSchema: z.ZodObject<{
    token: z.ZodString;
    password: z.ZodString;
}, "strict", z.ZodTypeAny, {
    password: string;
    token: string;
}, {
    password: string;
    token: string;
}>;
/** Cambio de contraseña con la sesión iniciada: exige la contraseña actual. */
export declare const changePasswordSchema: z.ZodEffects<z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strict", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>;
export declare const registerPilgrimSchema: z.ZodObject<{
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodString;
    documentNumber: z.ZodString;
    phone: z.ZodString;
    password: z.ZodString;
    acceptTerms: z.ZodLiteral<true>;
}, "strict", z.ZodTypeAny, {
    email: string;
    phone: string;
    password: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    acceptTerms: true;
}, {
    email: string;
    phone: string;
    password: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    acceptTerms: true;
}>;
/** Alta manual por el personal. Si hay coincidencias, se pide confirmar (confirmNewPerson) o elegir la existente. */
export declare const createPersonSchema: z.ZodObject<{
    confirmNewPerson: z.ZodOptional<z.ZodLiteral<true>>;
    firstName: z.ZodString;
    lastName: z.ZodOptional<z.ZodString>;
    documentType: z.ZodOptional<z.ZodString>;
    documentNumber: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    phone: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    email: z.ZodOptional<z.ZodString>;
    birthDate: z.ZodOptional<z.ZodEffects<z.ZodDate, Date, Date>>;
}, "strict", z.ZodTypeAny, {
    firstName: string;
    email?: string | undefined;
    phone?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    confirmNewPerson?: true | undefined;
    documentType?: string | undefined;
    birthDate?: Date | undefined;
}, {
    firstName: string;
    email?: string | undefined;
    phone?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    confirmNewPerson?: true | undefined;
    documentType?: string | undefined;
    birthDate?: Date | undefined;
}>;
export declare const updatePersonSchema: z.ZodObject<{
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    documentType: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    documentNumber: z.ZodOptional<z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>>;
    email: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    birthDate: z.ZodOptional<z.ZodOptional<z.ZodEffects<z.ZodDate, Date, Date>>>;
}, "strict", z.ZodTypeAny, {
    email?: string | undefined;
    phone?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    documentType?: string | undefined;
    birthDate?: Date | undefined;
}, {
    email?: string | undefined;
    phone?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    documentType?: string | undefined;
    birthDate?: Date | undefined;
}>;
export declare const personListSchema: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    q?: string | undefined;
}, {
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
/** Fusión explícita de duplicados: nunca automática. */
export declare const mergePersonSchema: z.ZodObject<{
    intoPersonId: z.ZodString;
    confirm: z.ZodLiteral<true>;
}, "strict", z.ZodTypeAny, {
    intoPersonId: string;
    confirm: true;
}, {
    intoPersonId: string;
    confirm: true;
}>;
/** El titular canjea desde su cuenta (email verificado) el código que le entregó la organización (prueba de posesión). */
export declare const claimPersonSchema: z.ZodObject<{
    code: z.ZodString;
    /** A5.0: confirmación explícita del titular para unir el registro de la organización a su cuenta. */
    confirm: z.ZodLiteral<true>;
}, "strict", z.ZodTypeAny, {
    code: string;
    confirm: true;
}, {
    code: string;
    confirm: true;
}>;
/** Desvinculación de una cuenta por la organización dueña de la Person: siempre con motivo (queda auditado). */
export declare const unlinkAccountSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare const bootstrapSchema: z.ZodObject<{
    organizationName: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
}, "strict", z.ZodTypeAny, {
    email: string;
    name: string;
    password: string;
    organizationName: string;
}, {
    email: string;
    name: string;
    password: string;
    organizationName: string;
}>;
/** Trayecto (origen → destino). Requiere la capacidad ROUTE. */
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
/**
 * Campos extra que el SUPERADMIN agrega al formulario público de inscripción de un evento. Los datos básicos
 * (nombre, apellido, documento y teléfono) son siempre fijos: identifican a la persona y evitan duplicados.
 */
export declare const REGISTRATION_FIELD_TYPES: readonly ["text", "textarea", "number", "date", "select", "checkbox"];
export type RegistrationFieldType = (typeof REGISTRATION_FIELD_TYPES)[number];
export declare const REGISTRATION_FIELD_TYPE_LABEL: Record<RegistrationFieldType, string>;
export declare const MAX_REGISTRATION_FIELDS = 15;
export declare const registrationFieldSchema: z.ZodEffects<z.ZodObject<{
    /** Identificador estable (lo genera el editor); las respuestas se guardan con esta clave. */
    id: z.ZodString;
    label: z.ZodString;
    type: z.ZodEnum<["text", "textarea", "number", "date", "select", "checkbox"]>;
    required: z.ZodDefault<z.ZodBoolean>;
    help: z.ZodOptional<z.ZodString>;
    options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
    label: string;
    id: string;
    required: boolean;
    options?: string[] | undefined;
    help?: string | undefined;
}, {
    type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
    label: string;
    id: string;
    options?: string[] | undefined;
    required?: boolean | undefined;
    help?: string | undefined;
}>, {
    type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
    label: string;
    id: string;
    required: boolean;
    options?: string[] | undefined;
    help?: string | undefined;
}, {
    type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
    label: string;
    id: string;
    options?: string[] | undefined;
    required?: boolean | undefined;
    help?: string | undefined;
}>;
export type RegistrationField = z.infer<typeof registrationFieldSchema>;
export declare const registrationFieldsSchema: z.ZodEffects<z.ZodArray<z.ZodEffects<z.ZodObject<{
    /** Identificador estable (lo genera el editor); las respuestas se guardan con esta clave. */
    id: z.ZodString;
    label: z.ZodString;
    type: z.ZodEnum<["text", "textarea", "number", "date", "select", "checkbox"]>;
    required: z.ZodDefault<z.ZodBoolean>;
    help: z.ZodOptional<z.ZodString>;
    options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
    label: string;
    id: string;
    required: boolean;
    options?: string[] | undefined;
    help?: string | undefined;
}, {
    type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
    label: string;
    id: string;
    options?: string[] | undefined;
    required?: boolean | undefined;
    help?: string | undefined;
}>, {
    type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
    label: string;
    id: string;
    required: boolean;
    options?: string[] | undefined;
    help?: string | undefined;
}, {
    type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
    label: string;
    id: string;
    options?: string[] | undefined;
    required?: boolean | undefined;
    help?: string | undefined;
}>, "many">, {
    type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
    label: string;
    id: string;
    required: boolean;
    options?: string[] | undefined;
    help?: string | undefined;
}[], {
    type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
    label: string;
    id: string;
    options?: string[] | undefined;
    required?: boolean | undefined;
    help?: string | undefined;
}[]>;
/**
 * Valida las respuestas contra los campos del evento. Devuelve las respuestas normalizadas (solo campos conocidos) o
 * la lista de problemas por campo. Lo usan la API (fuente de verdad) y el formulario web (aviso inmediato).
 */
export declare function validateRegistrationAnswers(fields: readonly RegistrationField[], raw: unknown): {
    ok: true;
    answers: Record<string, string | number | boolean>;
} | {
    ok: false;
    issues: {
        field: string;
        message: string;
    }[];
};
export declare const CREDENTIAL_MODES: readonly ["STANDARD", "CUSTOM"];
export type CredentialMode = (typeof CREDENTIAL_MODES)[number];
/**
 * Credencial SIEMPRE vertical, tamaño CR80 (tarjeta estándar): 54 × 85,6 mm (proporción 0,6308).
 * Diseño propio: imagen de fondo PNG o JPEG que cubre toda la tarjeta. Peregrinos dibuja encima, en la ZONA SEGURA
 * (mitad inferior), un panel blanco con el número, el QR y, si se pide, el nombre. El arte importante va arriba.
 */
export declare const CREDENTIAL_SPEC: {
    readonly widthMm: 54;
    readonly heightMm: 85.6;
    readonly ratio: number;
    readonly ratioTolerance: 0.02;
    readonly minPx: {
        readonly width: 638;
        readonly height: 1011;
    };
    readonly recommendedPx: {
        readonly width: 1276;
        readonly height: 2022;
    };
    readonly maxBytes: number;
    readonly mimes: readonly ["image/png", "image/jpeg"];
    /** Zona segura donde Peregrinos coloca los datos (milímetros desde la esquina superior izquierda). */
    readonly dataZoneMm: {
        readonly x: 4;
        readonly y: 40;
        readonly width: 46;
        readonly height: 41.6;
    };
};
export declare const PARISH_IMAGE_SPEC: {
    /** Logo: cuadrado (proporción 0,8–1,25), se muestra en un círculo. */
    readonly logo: {
        readonly mimes: readonly ["image/png", "image/jpeg", "image/webp"];
        readonly maxBytes: number;
        readonly minPx: 256;
        readonly maxPx: 4096;
        readonly minRatio: 0.8;
        readonly maxRatio: 1.25;
    };
    /** Imagen de la parroquia (portada): horizontal, proporción 1,5–2,2 (recomendado 1600 × 900). */
    readonly cover: {
        readonly mimes: readonly ["image/png", "image/jpeg", "image/webp"];
        readonly maxBytes: number;
        readonly minWidth: 1200;
        readonly minHeight: 600;
        readonly maxPx: 6000;
        readonly minRatio: 1.5;
        readonly maxRatio: 2.2;
    };
};
/**
 * Código único y permanente de cada parroquia: «PAR-» + 6 dígitos (p. ej. PAR-482193). Lo asigna la base al crear la
 * organización (función gen_parish_code(), índice único); no cambia con el nombre, el logo ni la dirección. Es público:
 * sirve para buscar y enlazar la parroquia, nunca como contraseña ni para dar permisos.
 */
export declare const PARISH_CODE_PATTERN: RegExp;
/** Acepta lo que alguien dicta o escribe («par 482193», «482193», «PAR-482193») y devuelve el código o null. */
export declare function normalizeParishCode(input: string): string | null;
/** Tamaños del cartel institucional imprimible. */
export declare const PARISH_POSTER_SIZES: readonly ["A4", "A3"];
export type ParishPosterSize = (typeof PARISH_POSTER_SIZES)[number];
export declare const organizationProfileSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    website: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    instagram: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    facebook: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    youtube: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    tiktok: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    /** SIGyP: horarios de atención y celebraciones (texto libre). */
    officeHours: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    description?: string | null | undefined;
    website?: string | null | undefined;
    email?: string | null | undefined;
    name?: string | undefined;
    phone?: string | null | undefined;
    address?: string | null | undefined;
    instagram?: string | null | undefined;
    facebook?: string | null | undefined;
    youtube?: string | null | undefined;
    officeHours?: string | null | undefined;
    tiktok?: string | null | undefined;
}, {
    description?: string | null | undefined;
    website?: string | null | undefined;
    email?: string | null | undefined;
    name?: string | undefined;
    phone?: string | null | undefined;
    address?: string | null | undefined;
    instagram?: string | null | undefined;
    facebook?: string | null | undefined;
    youtube?: string | null | undefined;
    officeHours?: string | null | undefined;
    tiktok?: string | null | undefined;
}>;
export declare const sendNotificationSchema: z.ZodObject<{
    title: z.ZodString;
    body: z.ZodString;
}, "strict", z.ZodTypeAny, {
    title: string;
    body: string;
}, {
    title: string;
    body: string;
}>;
export declare const chatMessageSchema: z.ZodObject<{
    body: z.ZodString;
}, "strict", z.ZodTypeAny, {
    body: string;
}, {
    body: string;
}>;
export declare const chatListQuerySchema: z.ZodObject<{
    /** Solo mensajes posteriores a este instante (para el sondeo periódico). */
    after: z.ZodOptional<z.ZodDate>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    after?: Date | undefined;
}, {
    after?: Date | undefined;
    limit?: number | undefined;
}>;
/** Sin `type` se asume OTHER (compatibilidad con clientes que aún no lo envían). */
export declare const createEventSchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY", "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER"]>>;
    status: z.ZodDefault<z.ZodEnum<["DRAFT", "SCHEDULED"]>>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    startsAt: z.ZodDate;
    endsAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    /** Zona horaria IANA del evento: todas sus fechas se muestran en ella. */
    timezone: z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>;
    /** A4: capacidades del evento. Sin indicar, el alta usa DEFAULT_EVENT_CAPABILITIES. */
    capabilities: z.ZodOptional<z.ZodArray<z.ZodEnum<["INFO", "LOCATION", "REGISTRATION", "PARTICIPANTS", "CHECKIN", "ROUTE", "POINTS", "CONTACTS", "CERTIFICATES", "VOLUNTEERS", "COMMUNICATIONS", "DOCUMENTS"]>, "many">>;
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
    /** B1: preguntas extra del formulario público de inscripción. */
    registrationFields: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodEffects<z.ZodObject<{
        /** Identificador estable (lo genera el editor); las respuestas se guardan con esta clave. */
        id: z.ZodString;
        label: z.ZodString;
        type: z.ZodEnum<["text", "textarea", "number", "date", "select", "checkbox"]>;
        required: z.ZodDefault<z.ZodBoolean>;
        help: z.ZodOptional<z.ZodString>;
        options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strict", z.ZodTypeAny, {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        required: boolean;
        options?: string[] | undefined;
        help?: string | undefined;
    }, {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
        help?: string | undefined;
    }>, {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        required: boolean;
        options?: string[] | undefined;
        help?: string | undefined;
    }, {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
        help?: string | undefined;
    }>, "many">, {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        required: boolean;
        options?: string[] | undefined;
        help?: string | undefined;
    }[], {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
        help?: string | undefined;
    }[]>>;
    /** B1: diseño de la credencial (estándar o fondo propio subido). */
    credentialMode: z.ZodOptional<z.ZodEnum<["STANDARD", "CUSTOM"]>>;
}, "strip", z.ZodTypeAny, {
    type: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY";
    status: "DRAFT" | "SCHEDULED";
    timezone: string;
    name: string;
    startsAt: Date;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    description?: string | undefined;
    endsAt?: Date | null | undefined;
    address?: string | null | undefined;
    locationName?: string | null | undefined;
    visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE" | undefined;
    capabilities?: ("VOLUNTEERS" | "INFO" | "LOCATION" | "REGISTRATION" | "PARTICIPANTS" | "CHECKIN" | "ROUTE" | "POINTS" | "CONTACTS" | "CERTIFICATES" | "COMMUNICATIONS" | "DOCUMENTS")[] | undefined;
    parishName?: string | null | undefined;
    capacity?: number | null | undefined;
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
    registrationFields?: {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        required: boolean;
        options?: string[] | undefined;
        help?: string | undefined;
    }[] | undefined;
    credentialMode?: "STANDARD" | "CUSTOM" | undefined;
}, {
    name: string;
    startsAt: Date;
    type?: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY" | undefined;
    status?: "DRAFT" | "SCHEDULED" | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    timezone?: string | undefined;
    description?: string | undefined;
    endsAt?: Date | null | undefined;
    address?: string | null | undefined;
    locationName?: string | null | undefined;
    visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE" | undefined;
    capabilities?: ("VOLUNTEERS" | "INFO" | "LOCATION" | "REGISTRATION" | "PARTICIPANTS" | "CHECKIN" | "ROUTE" | "POINTS" | "CONTACTS" | "CERTIFICATES" | "COMMUNICATIONS" | "DOCUMENTS")[] | undefined;
    parishName?: string | null | undefined;
    capacity?: number | null | undefined;
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
    registrationFields?: {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
        help?: string | undefined;
    }[] | undefined;
    credentialMode?: "STANDARD" | "CUSTOM" | undefined;
}>;
export declare const updateEventSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    type: z.ZodOptional<z.ZodEnum<["PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY", "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER"]>>;
    startsAt: z.ZodOptional<z.ZodDate>;
    endsAt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodDate>>>;
    timezone: z.ZodOptional<z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["DRAFT", "SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELLED"]>>>;
    capabilities: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodEnum<["INFO", "LOCATION", "REGISTRATION", "PARTICIPANTS", "CHECKIN", "ROUTE", "POINTS", "CONTACTS", "CERTIFICATES", "VOLUNTEERS", "COMMUNICATIONS", "DOCUMENTS"]>, "many">>>;
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
    registrationFields: z.ZodOptional<z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodEffects<z.ZodObject<{
        /** Identificador estable (lo genera el editor); las respuestas se guardan con esta clave. */
        id: z.ZodString;
        label: z.ZodString;
        type: z.ZodEnum<["text", "textarea", "number", "date", "select", "checkbox"]>;
        required: z.ZodDefault<z.ZodBoolean>;
        help: z.ZodOptional<z.ZodString>;
        options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strict", z.ZodTypeAny, {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        required: boolean;
        options?: string[] | undefined;
        help?: string | undefined;
    }, {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
        help?: string | undefined;
    }>, {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        required: boolean;
        options?: string[] | undefined;
        help?: string | undefined;
    }, {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
        help?: string | undefined;
    }>, "many">, {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        required: boolean;
        options?: string[] | undefined;
        help?: string | undefined;
    }[], {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
        help?: string | undefined;
    }[]>>>;
    credentialMode: z.ZodOptional<z.ZodOptional<z.ZodEnum<["STANDARD", "CUSTOM"]>>>;
}, "strip", z.ZodTypeAny, {
    type?: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY" | undefined;
    status?: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED" | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    timezone?: string | undefined;
    description?: string | undefined;
    name?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | null | undefined;
    address?: string | null | undefined;
    locationName?: string | null | undefined;
    visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE" | undefined;
    capabilities?: ("VOLUNTEERS" | "INFO" | "LOCATION" | "REGISTRATION" | "PARTICIPANTS" | "CHECKIN" | "ROUTE" | "POINTS" | "CONTACTS" | "CERTIFICATES" | "COMMUNICATIONS" | "DOCUMENTS")[] | undefined;
    parishName?: string | null | undefined;
    capacity?: number | null | undefined;
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
    registrationFields?: {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        required: boolean;
        options?: string[] | undefined;
        help?: string | undefined;
    }[] | undefined;
    credentialMode?: "STANDARD" | "CUSTOM" | undefined;
}, {
    type?: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY" | undefined;
    status?: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED" | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    timezone?: string | undefined;
    description?: string | undefined;
    name?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | null | undefined;
    address?: string | null | undefined;
    locationName?: string | null | undefined;
    visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE" | undefined;
    capabilities?: ("VOLUNTEERS" | "INFO" | "LOCATION" | "REGISTRATION" | "PARTICIPANTS" | "CHECKIN" | "ROUTE" | "POINTS" | "CONTACTS" | "CERTIFICATES" | "COMMUNICATIONS" | "DOCUMENTS")[] | undefined;
    parishName?: string | null | undefined;
    capacity?: number | null | undefined;
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
    registrationFields?: {
        type: "number" | "date" | "text" | "textarea" | "select" | "checkbox";
        label: string;
        id: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
        help?: string | undefined;
    }[] | undefined;
    credentialMode?: "STANDARD" | "CUSTOM" | undefined;
}>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export declare const eventListQuerySchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodEnum<["PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY", "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER"]>>;
    status: z.ZodOptional<z.ZodEnum<["DRAFT", "SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELLED"]>>;
}, "strip", z.ZodTypeAny, {
    type?: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY" | undefined;
    status?: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED" | undefined;
}, {
    type?: "OTHER" | "PILGRIMAGE" | "PROCESSION" | "PATRONAL_FEAST" | "LITURGICAL_CELEBRATION" | "ROSARY" | "RETREAT" | "GATHERING" | "COMMUNITY_ACTIVITY" | "CULTURAL_ACTIVITY" | undefined;
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
    /** A4: capacidades finales y datos del propio evento que dependen de ellas. */
    capabilities: readonly EventCapability[];
    hasLocation: boolean;
    registrationOpen: boolean;
    certificateEnabled: boolean;
}): {
    field: string;
    message: string;
}[];
/**
 * A4: estado de la inscripción, DERIVADO (no se guarda y nunca cambia el estado del evento).
 * DISABLED: sin capacidad REGISTRATION · CLOSED: interruptor apagado, evento no publicado/en curso o ventana vencida
 * · NOT_YET_OPEN: antes de registrationOpensAt · FULL: participantes ACTIVE >= capacity · OPEN: admite inscripciones.
 * El cupo cuenta solo Participant ACTIVE: las inscripciones pendientes no lo consumen.
 */
export declare const REGISTRATION_STATES: readonly ["DISABLED", "NOT_YET_OPEN", "OPEN", "FULL", "CLOSED"];
export type RegistrationState = (typeof REGISTRATION_STATES)[number];
/** Cupo agotado: solo con capacity definido; cuenta únicamente participantes ACTIVE. */
export declare const isCapacityFull: (capacity: number | null | undefined, activeParticipants: number) => boolean;
export declare function deriveRegistrationState(e: {
    capabilities: readonly string[];
    registrationOpen: boolean;
    status: EventStatus;
    registrationOpensAt?: Date | null;
    registrationClosesAt?: Date | null;
    capacity?: number | null;
    activeParticipants: number;
}, now?: Date): RegistrationState;
/** Inscripción abierta ahora (capacidad + interruptor + estado operable + ventana opcional). */
export declare const REGISTRATION_STATE_LABEL: Record<ReturnType<typeof deriveRegistrationState>, string>;
export declare const isRegistrationOpenNow: (e: Parameters<typeof deriveRegistrationState>[0], now?: Date) => boolean;
/**
 * A4: asistencia DERIVADA (sin columna). ATTENDED: tiene al menos una llegada ACTIVE.
 * NO_SHOW: evento finalizado, participante ACTIVE y sin llegadas. null: todavía no se puede determinar.
 */
export type Attendance = "ATTENDED" | "NO_SHOW";
export declare function deriveAttendance(p: {
    eventStatus: EventStatus;
    participantStatus: string;
    activeCheckins: number;
}): Attendance | null;
export declare const createUserSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodEnum<["SUPERADMIN", "ADMIN", "OPERATOR"]>;
    extraPermissions: z.ZodDefault<z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodString, "many">, ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[], string[]>, ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[], string[]>>;
}, "strict", z.ZodTypeAny, {
    email: string;
    name: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    password: string;
    extraPermissions: ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[];
}, {
    email: string;
    name: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    password: string;
    extraPermissions?: string[] | undefined;
}>;
export declare const updateUserSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodEnum<["SUPERADMIN", "ADMIN", "OPERATOR"]>>;
    isActive: z.ZodOptional<z.ZodBoolean>;
    password: z.ZodOptional<z.ZodString>;
    extraPermissions: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodString, "many">, ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[], string[]>, ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[], string[]>>;
}, "strict", z.ZodTypeAny, {
    name?: string | undefined;
    role?: "SUPERADMIN" | "ADMIN" | "OPERATOR" | undefined;
    password?: string | undefined;
    extraPermissions?: ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[] | undefined;
    isActive?: boolean | undefined;
}, {
    name?: string | undefined;
    role?: "SUPERADMIN" | "ADMIN" | "OPERATOR" | undefined;
    password?: string | undefined;
    extraPermissions?: string[] | undefined;
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
    /** A3: estado del ciclo de vida de la organización del usuario. */
    organizationStatus: OrganizationStatus;
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
    /** A6: estado del segundo factor de la cuenta y de esta sesión. */
    mfa: MfaStatus;
}
export interface MfaStatus {
    /** Se exige segundo factor a esta cuenta (nunca al SUPERADMIN, que entra con usuario y contraseña). */
    enabled: boolean;
    /** Hasta cuándo vale el último segundo factor de esta sesión para acciones sensibles (ISO) o null. */
    stepUpValidUntil: string | null;
    recoveryCodesRemaining: number;
}
/** Login en dos pasos: la contraseña fue correcta y falta el segundo factor (no hay sesión todavía). */
export interface MfaChallengeResponse {
    mfaRequired: true;
}
export declare const isMfaChallenge: (v: unknown) => v is MfaChallengeResponse;
/** Segundo paso del login y step-up: un código TOTP o un código de recuperación (exactamente uno). */
export declare const mfaVerifySchema: z.ZodEffects<z.ZodObject<{
    code: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    recoveryCode: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    code?: string | undefined;
    recoveryCode?: string | undefined;
}, {
    code?: string | undefined;
    recoveryCode?: string | undefined;
}>, {
    code?: string | undefined;
    recoveryCode?: string | undefined;
}, {
    code?: string | undefined;
    recoveryCode?: string | undefined;
}>;
/** Confirmar el enrolamiento: el primer código generado por la app. */
export declare const mfaConfirmSchema: z.ZodObject<{
    code: z.ZodEffects<z.ZodString, string, string>;
}, "strict", z.ZodTypeAny, {
    code: string;
}, {
    code: string;
}>;
/** Desactivar MFA o regenerar códigos: exige la contraseña además del step-up. */
export declare const mfaPasswordSchema: z.ZodObject<{
    password: z.ZodString;
}, "strict", z.ZodTypeAny, {
    password: string;
}, {
    password: string;
}>;
/** Número visible con ceros: 1 -> "001" */
export declare const formatParticipantNumber: (n: number) => string;
/** A4: participación oficial confirmada (ACTIVE) o cancelada. La asistencia se deriva (deriveAttendance). */
export declare const PARTICIPANT_STATUSES: readonly ["ACTIVE", "CANCELLED"];
export declare const CHECKIN_METHODS: readonly ["NUMBER", "QR", "SEARCH"];
export type CheckinMethod = (typeof CHECKIN_METHODS)[number];
/** Prefijo del contenido del QR: "PG1:<token opaco>". Nunca lleva datos personales. */
export declare const QR_PREFIX = "PG1:";
export declare const qrContent: (token: string) => string;
export declare const parseQrContent: (raw: string) => string | null;
export declare const normalizeDocument: (s: string) => string;
export declare const digitsOnly: (s: string) => string;
/**
 * A4a: la participación pertenece a una Person. personId elige una existente de la organización; sin personId se crea
 * una nueva, salvo que haya coincidencias por documento o teléfono: entonces se exige elegir o confirmNewPerson.
 */
export declare const createParticipantSchema: z.ZodObject<{
    personId: z.ZodOptional<z.ZodString>;
    confirmNewPerson: z.ZodOptional<z.ZodLiteral<true>>;
    firstName: z.ZodString;
    lastName: z.ZodString;
    documentNumber: z.ZodEffects<z.ZodString, string, string>;
    phone: z.ZodEffects<z.ZodString, string, string>;
    documentType: z.ZodDefault<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    number: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    phone: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    documentType: string;
    number?: number | undefined;
    notes?: string | undefined;
    confirmNewPerson?: true | undefined;
    personId?: string | undefined;
}, {
    phone: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    number?: number | undefined;
    notes?: string | undefined;
    confirmNewPerson?: true | undefined;
    documentType?: string | undefined;
    personId?: string | undefined;
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
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "CANCELLED"]>>;
}, "strip", z.ZodTypeAny, {
    number?: number | undefined;
    status?: "CANCELLED" | "ACTIVE" | undefined;
    notes?: string | undefined;
    phone?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    documentType?: string | undefined;
}, {
    number?: number | undefined;
    status?: "CANCELLED" | "ACTIVE" | undefined;
    notes?: string | undefined;
    phone?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    documentType?: string | undefined;
}>;
export declare const participantListSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    q: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "CANCELLED"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "CANCELLED" | "ACTIVE" | undefined;
    q?: string | undefined;
}, {
    status?: "CANCELLED" | "ACTIVE" | undefined;
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
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
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    description?: string | undefined;
    address?: string | undefined;
    capacity?: number | null | undefined;
    reference?: string | undefined;
}, {
    name: string;
    status?: "ACTIVE" | "INACTIVE" | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    description?: string | undefined;
    address?: string | undefined;
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
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    description?: string | undefined;
    name?: string | undefined;
    address?: string | undefined;
    capacity?: number | null | undefined;
    reference?: string | undefined;
}, {
    status?: "ACTIVE" | "INACTIVE" | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    description?: string | undefined;
    name?: string | undefined;
    address?: string | undefined;
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
/**
 * B5 — Catálogo de permisos que se otorgan individualmente a un colaborador (además de los de su nivel). Agregar un
 * permiso nuevo = sumarlo a `Permission`, al SUPERADMIN y a este catálogo: la API (requirePermission), el menú (can) y
 * la pantalla de permisos lo toman de aquí. Nadie otorga un permiso que no tiene (assertCanGrantPermissions).
 * Quedan fuera los propios del SUPERADMIN: user:manage (otorgar niveles), backup:run y audit:read.
 */
export declare const PERMISSION_CATALOG: readonly [{
    readonly id: "parish:profile";
    readonly group: "Perfil y publicaciones";
    readonly label: "Perfil de la parroquia";
    readonly description: "Ver y editar el perfil público, el logo y el cartel";
}, {
    readonly id: "post:manage";
    readonly group: "Perfil y publicaciones";
    readonly label: "Publicaciones y fotografías";
    readonly description: "Portadas y fotos de los eventos publicados";
}, {
    readonly id: "notice:send";
    readonly group: "Perfil y publicaciones";
    readonly label: "Avisos y boletín";
    readonly description: "Enviar avisos a los seguidores y publicar el boletín";
}, {
    readonly id: "notice:staff";
    readonly group: "Perfil y publicaciones";
    readonly label: "Avisos al personal";
    readonly description: "Enviar avisos a la administración y a los operadores de la parroquia (requiere también «Avisos y boletín»)";
}, {
    readonly id: "stream:manage";
    readonly group: "Perfil y publicaciones";
    readonly label: "Transmisiones en vivo";
    readonly description: "Cargar la transmisión de YouTube, iniciarla y finalizarla";
}, {
    readonly id: "event:create";
    readonly group: "Eventos y seguimiento";
    readonly label: "Crear eventos";
    readonly description: "Dar de alta eventos nuevos";
}, {
    readonly id: "event:update";
    readonly group: "Eventos y seguimiento";
    readonly label: "Administrar eventos";
    readonly description: "Editar datos, estado, inscripción y formulario";
}, {
    readonly id: "payment:review";
    readonly group: "Eventos y seguimiento";
    readonly label: "Inscripciones y pagos";
    readonly description: "Ver inscripciones y revisar comprobantes";
}, {
    readonly id: "participant:create";
    readonly group: "Eventos y seguimiento";
    readonly label: "Agregar participantes";
    readonly description: "Dar de alta personas en el evento";
}, {
    readonly id: "checkin:create";
    readonly group: "Eventos y seguimiento";
    readonly label: "Registrar llegadas";
    readonly description: "Check-in con QR, número o búsqueda";
}, {
    readonly id: "checkin:read";
    readonly group: "Eventos y seguimiento";
    readonly label: "Historial de llegadas";
    readonly description: "Ver el registro de llegadas";
}, {
    readonly id: "tracking:read";
    readonly group: "Eventos y seguimiento";
    readonly label: "Mapa y seguimiento en vivo";
    readonly description: "Ver la ubicación de los peregrinos que la comparten";
}, {
    readonly id: "chat:moderate";
    readonly group: "Eventos y seguimiento";
    readonly label: "Moderar el chat";
    readonly description: "Ocultar mensajes del chat del evento";
}, {
    readonly id: "report:read";
    readonly group: "Eventos y seguimiento";
    readonly label: "Estadísticas e informes";
    readonly description: "Informe del evento y estadísticas";
}, {
    readonly id: "agenda:manage";
    readonly group: "Agenda y vida parroquial";
    readonly label: "Agenda pastoral";
    readonly description: "Horarios de misa, confesiones, adoración y actividades";
}, {
    readonly id: "group:manage";
    readonly group: "Agenda y vida parroquial";
    readonly label: "Grupos pastorales";
    readonly description: "Grupos, miembros, encuentros y asistencia";
}, {
    readonly id: "donation:manage";
    readonly group: "Donaciones";
    readonly label: "Donaciones";
    readonly description: "Campañas y enlaces de pago de la parroquia";
}, {
    readonly id: "certificate:manage";
    readonly group: "Administración parroquial";
    readonly label: "Certificados sacramentales";
    readonly description: "Atender solicitudes de partidas";
}, {
    readonly id: "inventory:manage";
    readonly group: "Administración parroquial";
    readonly label: "Inventario";
    readonly description: "Bienes y recursos de la parroquia";
}, {
    readonly id: "invitation:manage";
    readonly group: "Acceso y permisos";
    readonly label: "Invitaciones";
    readonly description: "Invitar colaboradores (solo con permisos que la persona tenga)";
}];
export declare const GRANTABLE_PERMISSIONS: readonly [GrantablePermission, ...GrantablePermission[]];
export type GrantablePermission = (typeof PERMISSION_CATALOG)[number]["id"];
export declare const isGrantablePermission: (p: string) => p is GrantablePermission;
export declare function effectivePermissions(role: Role, extras?: readonly string[]): Permission[];
export declare const hasPermission: (role: Role, extras: readonly string[], p: Permission) => boolean;
/**
 * B5 — Mínimo privilegio al otorgar: cada permiso extra debe estar en el catálogo y quien lo otorga debe tenerlo él
 * mismo. Devuelve los que no puede otorgar (vacío = todo en orden). El servidor lo exige; la pantalla solo lo refleja.
 */
export declare function permissionsNotGrantableBy(granter: {
    role: Role;
    extraPermissions: readonly string[];
}, requested: readonly string[]): string[];
/** Nadie puede dar un nivel superior al suyo: el Superadmin da cualquiera; el Administrador solo nivel operador. */
export declare const canGrantRole: (granter: Role, target: Role) => boolean;
/**
 * A1: roles que se pueden otorgar por invitación o alta directa. SUPERADMIN queda excluido:
 * solo se otorga promoviendo a un miembro activo del personal (PATCH /users/:id), con un único
 * punto de control en el servidor. Una invitación es un enlace al portador y no debe dar SUPERADMIN.
 */
export declare const canInviteRole: (granter: Role, target: Role) => boolean;
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
    extraPermissions: z.ZodDefault<z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodString, "many">, ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[], string[]>, ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[], string[]>>;
    checkpointIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    email: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    extraPermissions: ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[];
    checkpointIds: string[];
}, {
    email: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    extraPermissions?: string[] | undefined;
    checkpointIds?: string[] | undefined;
}>, {
    email: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    extraPermissions: ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[];
    checkpointIds: string[];
}, {
    email: string;
    role: "SUPERADMIN" | "ADMIN" | "OPERATOR";
    extraPermissions?: string[] | undefined;
    checkpointIds?: string[] | undefined;
}>;
export declare const acceptInvitationSchema: z.ZodObject<{
    token: z.ZodString;
    name: z.ZodString;
    password: z.ZodString;
}, "strict", z.ZodTypeAny, {
    name: string;
    password: string;
    token: string;
}, {
    name: string;
    password: string;
    token: string;
}>;
/** B5: rechazar la invitación desde su enlace (no crea cuenta ni concede nada). */
export declare const declineInvitationSchema: z.ZodObject<{
    token: z.ZodString;
}, "strict", z.ZodTypeAny, {
    token: string;
}, {
    token: string;
}>;
/** B5: permisos de un colaborador (reemplaza la lista completa de permisos extra). */
export declare const userPermissionsSchema: z.ZodObject<{
    extraPermissions: z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodString, "many">, ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[], string[]>, ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[], string[]>;
}, "strict", z.ZodTypeAny, {
    extraPermissions: ("event:create" | "event:update" | "participant:create" | "checkin:create" | "checkin:read" | "report:read" | "invitation:manage" | "payment:review" | "parish:profile" | "notice:send" | "post:manage" | "stream:manage" | "chat:moderate" | "tracking:read" | "certificate:manage" | "agenda:manage" | "donation:manage" | "inventory:manage" | "group:manage" | "notice:staff")[];
}, {
    extraPermissions: string[];
}>;
declare const SOCIAL_HOSTS: {
    readonly instagram: readonly ["instagram.com"];
    readonly facebook: readonly ["facebook.com", "fb.com"];
    readonly youtube: readonly ["youtube.com", "youtu.be"];
};
export type SocialNetwork = keyof typeof SOCIAL_HOSTS;
export declare const SOCIAL_NETWORK_LABEL: Record<SocialNetwork, string>;
/**
 * Red social: acepta "@usuario", "usuario" o el enlace completo del dominio de esa red. Devuelve "@usuario" o el enlace
 * en https; null si no corresponde a esa red. (El perfil público entiende ambos formatos.)
 */
export declare function normalizeSocial(net: SocialNetwork, raw: string): string | null;
/** Sitio web: agrega https:// si falta; exige un dominio con punto. null si no es una dirección válida. */
export declare function normalizeWebsite(raw: string): string | null;
/**
 * Foto principal de la solicitud: se recorta en el navegador a 2:1 y, al aprobar, pasa a ser la imagen de la parroquia
 * (PARISH_IMAGE_SPEC.cover). Recomendado 1600 × 800 px.
 */
export declare const PARISH_REQUEST_PHOTO_SPEC: {
    readonly mimes: readonly ["image/png", "image/jpeg", "image/webp"];
    readonly maxBytes: number;
    readonly minWidth: 1200;
    readonly minHeight: 600;
    readonly maxPx: 6000;
    readonly ratio: 2;
    readonly minRatio: 1.95;
    readonly maxRatio: 2.05;
    readonly outputWidth: 1600;
    readonly outputHeight: 800;
};
/** Solicitud pública de una nueva parroquia. No incluye estado, rol ni organización: los decide la plataforma. */
export declare const organizationRequestSchema: z.ZodObject<{
    acceptTerms: z.ZodLiteral<true>;
    parishName: z.ZodString;
    contactName: z.ZodString;
    contactEmail: z.ZodString;
    contactPhone: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    /** ISO 3166-1 alfa-2 (catálogo internacional G1). */
    countryCode: z.ZodString;
    locality: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    address: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    website: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    instagram: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    facebook: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    youtube: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
}, "strict", z.ZodTypeAny, {
    acceptTerms: true;
    parishName: string;
    contactName: string;
    contactEmail: string;
    countryCode: string;
    notes?: string | undefined;
    website?: string | undefined;
    address?: string | undefined;
    instagram?: string | undefined;
    facebook?: string | undefined;
    youtube?: string | undefined;
    contactPhone?: string | undefined;
    locality?: string | undefined;
}, {
    acceptTerms: true;
    parishName: string;
    contactName: string;
    contactEmail: string;
    countryCode: string;
    notes?: string | undefined;
    website?: string | undefined;
    address?: string | undefined;
    instagram?: string | undefined;
    facebook?: string | undefined;
    youtube?: string | undefined;
    contactPhone?: string | undefined;
    locality?: string | undefined;
}>;
/** Corrección y nueva presentación de una solicitud rechazada (con el token privado del solicitante). */
export declare const resubmitOrganizationRequestSchema: z.ZodObject<{
    parishName: z.ZodString;
    contactName: z.ZodString;
    contactEmail: z.ZodString;
    contactPhone: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    /** ISO 3166-1 alfa-2 (catálogo internacional G1). */
    countryCode: z.ZodString;
    locality: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    address: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    website: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    instagram: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    facebook: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    youtube: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    token: z.ZodString;
}, "strict", z.ZodTypeAny, {
    token: string;
    parishName: string;
    contactName: string;
    contactEmail: string;
    countryCode: string;
    notes?: string | undefined;
    website?: string | undefined;
    address?: string | undefined;
    instagram?: string | undefined;
    facebook?: string | undefined;
    youtube?: string | undefined;
    contactPhone?: string | undefined;
    locality?: string | undefined;
}, {
    token: string;
    parishName: string;
    contactName: string;
    contactEmail: string;
    countryCode: string;
    notes?: string | undefined;
    website?: string | undefined;
    address?: string | undefined;
    instagram?: string | undefined;
    facebook?: string | undefined;
    youtube?: string | undefined;
    contactPhone?: string | undefined;
    locality?: string | undefined;
}>;
export declare const organizationRequestTokenSchema: z.ZodObject<{
    token: z.ZodString;
}, "strict", z.ZodTypeAny, {
    token: string;
}, {
    token: string;
}>;
/** Revisión por PLATFORM. El motivo es obligatorio para rechazar y suspender. */
export declare const platformApproveSchema: z.ZodObject<{
    note: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    note?: string | undefined;
}, {
    note?: string | undefined;
}>;
export declare const platformRejectSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare const organizationTransitionSchema: z.ZodObject<{
    to: z.ZodEnum<["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "ARCHIVED"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    to: "REJECTED" | "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "SUSPENDED" | "ARCHIVED";
    reason?: string | undefined;
}, {
    to: "REJECTED" | "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "SUSPENDED" | "ARCHIVED";
    reason?: string | undefined;
}>;
/** Presentación a revisión por el SUPERADMIN de la parroquia (DRAFT/REJECTED → PENDING_REVIEW). */
export declare const submitOrganizationReviewSchema: z.ZodObject<{
    note: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    note?: string | undefined;
}, {
    note?: string | undefined;
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
    sortOrder: number;
    name: string;
    phone: string;
    isEmergency: boolean;
    notes?: string | undefined;
    email?: string | undefined;
    checkpointId?: string | null | undefined;
    roleLabel?: string | undefined;
}, {
    name: string;
    phone: string;
    notes?: string | undefined;
    sortOrder?: number | undefined;
    email?: string | undefined;
    checkpointId?: string | null | undefined;
    roleLabel?: string | undefined;
    isEmergency?: boolean | undefined;
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
    notes?: string | undefined;
    sortOrder?: number | undefined;
    email?: string | undefined;
    name?: string | undefined;
    phone?: string | undefined;
    checkpointId?: string | null | undefined;
    roleLabel?: string | undefined;
    isEmergency?: boolean | undefined;
}, {
    notes?: string | undefined;
    sortOrder?: number | undefined;
    email?: string | undefined;
    name?: string | undefined;
    phone?: string | undefined;
    checkpointId?: string | null | undefined;
    roleLabel?: string | undefined;
    isEmergency?: boolean | undefined;
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
    /** B1: respuestas a las preguntas extra del evento (se validan contra Event.registrationFields). */
    answers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    phone: string;
    token: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    answers?: Record<string, unknown> | undefined;
}, {
    phone: string;
    token: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    answers?: Record<string, unknown> | undefined;
}>;
export declare const proofFieldsSchema: z.ZodObject<{
    amount: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
    reference: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    paidAt: z.ZodEffects<z.ZodOptional<z.ZodDate>, Date | undefined, unknown>;
    note: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    note?: string | undefined;
    reference?: string | undefined;
    amount?: number | undefined;
    paidAt?: Date | undefined;
}, {
    note?: unknown;
    reference?: unknown;
    amount?: unknown;
    paidAt?: unknown;
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
    status?: "IN_REVIEW" | "REJECTED" | "APPROVED" | "CANCELLED" | "PENDING_PROOF" | undefined;
    q?: string | undefined;
}, {
    status?: "IN_REVIEW" | "REJECTED" | "APPROVED" | "CANCELLED" | "PENDING_PROOF" | undefined;
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
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
/** A4: el personal reabre una inscripción rechazada (REJECTED → IN_REVIEW). Siempre con motivo; aprobar sigue pasando por IN_REVIEW. */
export declare const reopenRegistrationSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
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
/**
 * Estado de la participación como voluntario (no es un rol de cuenta). ASSIGNED/ACTIVE no son estados:
 * se derivan de las asignaciones vigentes y de los turnos.
 */
export declare const VOLUNTEER_STATUSES: readonly ["REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "WITHDRAWN", "REVOKED", "COMPLETED"];
export type VolunteerStatus = (typeof VOLUNTEER_STATUSES)[number];
export declare const VOLUNTEER_STATUS_LABEL: Record<VolunteerStatus, string>;
/** Alta por el personal: como candidato (REQUESTED) o ya aprobado. */
export declare const VOLUNTEER_INITIAL_STATUSES: readonly ["REQUESTED", "APPROVED"];
export declare const VOLUNTEER_TRANSITIONS: Readonly<Record<VolunteerStatus, readonly VolunteerStatus[]>>;
export declare const canTransitionVolunteer: (from: VolunteerStatus, to: VolunteerStatus) => boolean;
/** Rechazar o dar de baja exige motivo. */
export declare const VOLUNTEER_REASON_REQUIRED: readonly VolunteerStatus[];
/** Alta de voluntario: una Person existente (visible para la organización) o una nueva (con confirmación de duplicados). */
export declare const createVolunteerSchema: z.ZodEffects<z.ZodObject<{
    personId: z.ZodOptional<z.ZodString>;
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    documentNumber: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    confirmNewPerson: z.ZodOptional<z.ZodLiteral<true>>;
    status: z.ZodDefault<z.ZodEnum<["REQUESTED", "APPROVED"]>>;
    notes: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status: "APPROVED" | "REQUESTED";
    notes?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    confirmNewPerson?: true | undefined;
    personId?: string | undefined;
}, {
    status?: "APPROVED" | "REQUESTED" | undefined;
    notes?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    confirmNewPerson?: true | undefined;
    personId?: string | undefined;
}>, {
    status: "APPROVED" | "REQUESTED";
    notes?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    confirmNewPerson?: true | undefined;
    personId?: string | undefined;
}, {
    status?: "APPROVED" | "REQUESTED" | undefined;
    notes?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    documentNumber?: string | undefined;
    confirmNewPerson?: true | undefined;
    personId?: string | undefined;
}>;
/**
 * A5.1: canje por la organización del código que la persona generó en su cuenta (para el evento de la ruta). Solo el
 * código: crea una solicitud que la persona acepta o rechaza; nunca identifica a la persona por otros datos.
 */
export declare const volunteerConsentRequestSchema: z.ZodObject<{
    code: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code: string;
}, {
    code: string;
}>;
/** A5.1: vigencia del código de consentimiento y, una vez canjeado, de la solicitud. */
export declare const VOLUNTEER_CONSENT_CODE_HOURS = 72;
/** A5.1: estado derivado de una solicitud de consentimiento (no se persiste). */
export declare const VOLUNTEER_REQUEST_STATUSES: readonly ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"];
export type VolunteerRequestStatus = (typeof VOLUNTEER_REQUEST_STATUSES)[number];
export declare const VOLUNTEER_REQUEST_STATUS_LABEL: Record<VolunteerRequestStatus, string>;
export declare const volunteerTransitionSchema: z.ZodObject<{
    to: z.ZodEnum<["REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "WITHDRAWN", "REVOKED", "COMPLETED"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    to: "REJECTED" | "APPROVED" | "REQUESTED" | "UNDER_REVIEW" | "WITHDRAWN" | "REVOKED" | "COMPLETED";
    reason?: string | undefined;
}, {
    to: "REJECTED" | "APPROVED" | "REQUESTED" | "UNDER_REVIEW" | "WITHDRAWN" | "REVOKED" | "COMPLETED";
    reason?: string | undefined;
}>;
/** Equipos, zonas y funciones: nombres libres que define la organización (sin enums). */
export declare const catalogItemSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
}, {
    name: string;
    description?: string | undefined;
}>;
export declare const catalogUpdateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    description?: string | null | undefined;
    name?: string | undefined;
    isActive?: boolean | undefined;
}, {
    description?: string | null | undefined;
    name?: string | undefined;
    isActive?: boolean | undefined;
}>;
export declare const createShiftSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    startsAt: z.ZodDate;
    endsAt: z.ZodDate;
    zoneId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    teamId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    startsAt: Date;
    endsAt: Date;
    name?: string | undefined;
    zoneId?: string | null | undefined;
    teamId?: string | null | undefined;
}, {
    startsAt: Date;
    endsAt: Date;
    name?: string | undefined;
    zoneId?: string | null | undefined;
    teamId?: string | null | undefined;
}>, {
    startsAt: Date;
    endsAt: Date;
    name?: string | undefined;
    zoneId?: string | null | undefined;
    teamId?: string | null | undefined;
}, {
    startsAt: Date;
    endsAt: Date;
    name?: string | undefined;
    zoneId?: string | null | undefined;
    teamId?: string | null | undefined;
}>;
export declare const updateShiftSchema: z.ZodObject<{
    startsAt: z.ZodOptional<z.ZodDate>;
    endsAt: z.ZodOptional<z.ZodDate>;
    cancel: z.ZodOptional<z.ZodLiteral<true>>;
    name: z.ZodOptional<z.ZodString>;
    zoneId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    teamId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    name?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | undefined;
    zoneId?: string | null | undefined;
    teamId?: string | null | undefined;
    cancel?: true | undefined;
}, {
    name?: string | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | undefined;
    zoneId?: string | null | undefined;
    teamId?: string | null | undefined;
    cancel?: true | undefined;
}>;
export declare const createAssignmentSchema: z.ZodObject<{
    volunteerId: z.ZodString;
    functionId: z.ZodString;
    teamId: z.ZodOptional<z.ZodString>;
    zoneId: z.ZodOptional<z.ZodString>;
    shiftId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    volunteerId: string;
    functionId: string;
    zoneId?: string | undefined;
    teamId?: string | undefined;
    shiftId?: string | undefined;
}, {
    volunteerId: string;
    functionId: string;
    zoneId?: string | undefined;
    teamId?: string | undefined;
    shiftId?: string | undefined;
}>;
export declare const revokeAssignmentSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export * from "./locale";
export * from "./parishTools";
export * from "./sigyp";
