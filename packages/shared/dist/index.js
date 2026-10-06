"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatParticipantNumber = exports.mfaPasswordSchema = exports.mfaConfirmSchema = exports.mfaVerifySchema = exports.isMfaChallenge = exports.paginationSchema = exports.assignmentsSchema = exports.updateUserSchema = exports.createUserSchema = exports.isRegistrationOpenNow = exports.isCapacityFull = exports.REGISTRATION_STATES = exports.eventListQuerySchema = exports.updateEventSchema = exports.createEventSchema = exports.eventSettingsSchemas = exports.eventRouteSchema = exports.bootstrapSchema = exports.unlinkAccountSchema = exports.claimPersonSchema = exports.mergePersonSchema = exports.personListSchema = exports.updatePersonSchema = exports.createPersonSchema = exports.registerPilgrimSchema = exports.changePasswordSchema = exports.passwordResetConfirmSchema = exports.accountEmailSchema = exports.loginSchema = exports.ROLE_PERMISSIONS = exports.EVENT_VISIBILITY_LABEL = exports.EVENT_VISIBILITIES = exports.EVENT_TYPE_INFO = exports.EVENT_TYPES = exports.isEventOperable = exports.hasEventCapability = exports.EVENT_CAPABILITY_REQUIRES = exports.EVENT_CAPABILITY_LABEL = exports.DEFAULT_EVENT_CAPABILITIES = exports.IMPLEMENTED_EVENT_CAPABILITIES = exports.RESERVED_EVENT_CAPABILITIES = exports.EVENT_CAPABILITIES = exports.canTransitionEvent = exports.EVENT_TRANSITIONS = exports.EVENT_INITIAL_STATUSES = exports.EVENT_STATUS_LABEL = exports.EVENT_STATUSES = exports.ORGANIZATION_STATUS_LABEL = exports.ORGANIZATION_STATUSES = exports.ROLES = void 0;
exports.canTransitionVolunteer = exports.VOLUNTEER_TRANSITIONS = exports.VOLUNTEER_INITIAL_STATUSES = exports.VOLUNTEER_STATUS_LABEL = exports.VOLUNTEER_STATUSES = exports.credentialQuerySchema = exports.reopenRegistrationSchema = exports.rejectRegistrationSchema = exports.approveRegistrationSchema = exports.registrationListSchema = exports.proofFieldsSchema = exports.createRegistrationSchema = exports.REGISTRATION_STATUSES = exports.qBool = exports.updateContactSchema = exports.createContactSchema = exports.issueAccessSchema = exports.pilgrimLoginSchema = exports.submitOrganizationReviewSchema = exports.organizationTransitionSchema = exports.platformRejectSchema = exports.platformApproveSchema = exports.organizationRequestTokenSchema = exports.resubmitOrganizationRequestSchema = exports.organizationRequestSchema = exports.acceptInvitationSchema = exports.createInvitationSchema = exports.ACCESS_LEVELS = exports.canInviteRole = exports.canGrantRole = exports.hasPermission = exports.GRANTABLE_PERMISSIONS = exports.checkinListSchema = exports.resolveConflictSchema = exports.correctCheckinSchema = exports.cancelCheckinSchema = exports.createCheckinSchema = exports.reorderCheckpointsSchema = exports.updateCheckpointSchema = exports.createCheckpointSchema = exports.participantListSchema = exports.updateParticipantSchema = exports.createParticipantSchema = exports.digitsOnly = exports.normalizeDocument = exports.parseQrContent = exports.qrContent = exports.QR_PREFIX = exports.CHECKIN_METHODS = exports.PARTICIPANT_STATUSES = void 0;
exports.revokeAssignmentSchema = exports.createAssignmentSchema = exports.updateShiftSchema = exports.createShiftSchema = exports.catalogUpdateSchema = exports.catalogItemSchema = exports.volunteerTransitionSchema = exports.VOLUNTEER_REQUEST_STATUS_LABEL = exports.VOLUNTEER_REQUEST_STATUSES = exports.VOLUNTEER_CONSENT_CODE_HOURS = exports.volunteerConsentRequestSchema = exports.createVolunteerSchema = exports.VOLUNTEER_REASON_REQUIRED = void 0;
exports.validateEventCapabilities = validateEventCapabilities;
exports.can = can;
exports.validateEventCoherence = validateEventCoherence;
exports.deriveRegistrationState = deriveRegistrationState;
exports.deriveAttendance = deriveAttendance;
exports.effectivePermissions = effectivePermissions;
const zod_1 = require("zod");
const locale_1 = require("./locale");
/* ---------- Roles y permisos (única fuente de verdad: API y Web) ---------- */
exports.ROLES = ["SUPERADMIN", "ADMIN", "OPERATOR"];
/* ---------- A3: ciclo de vida de organizaciones ---------- */
exports.ORGANIZATION_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "ARCHIVED"];
exports.ORGANIZATION_STATUS_LABEL = {
    DRAFT: "Borrador", PENDING_REVIEW: "En revisión", APPROVED: "Aprobada", REJECTED: "Rechazada", SUSPENDED: "Suspendida", ARCHIVED: "Archivada",
};
/**
 * Ciclo de vida del evento (independiente del de la inscripción).
 * DRAFT: en preparación · SCHEDULED: publicado · IN_PROGRESS: en curso · FINISHED: finalizado · CANCELLED: cancelado.
 */
exports.EVENT_STATUSES = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELLED"];
exports.EVENT_STATUS_LABEL = {
    DRAFT: "Borrador", SCHEDULED: "Publicado", IN_PROGRESS: "En curso", FINISHED: "Finalizado", CANCELLED: "Cancelado",
};
/** A4: estados con los que se puede crear un evento (crear publicado = DRAFT → SCHEDULED en un paso). */
exports.EVENT_INITIAL_STATUSES = ["DRAFT", "SCHEDULED"];
/** A4: únicas transiciones permitidas. FINISHED y CANCELLED son terminales. */
exports.EVENT_TRANSITIONS = {
    DRAFT: ["SCHEDULED", "CANCELLED"],
    SCHEDULED: ["DRAFT", "IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["FINISHED", "CANCELLED"],
    FINISHED: [],
    CANCELLED: [],
};
const canTransitionEvent = (from, to) => exports.EVENT_TRANSITIONS[from].includes(to);
exports.canTransitionEvent = canTransitionEvent;
/* ---------- A4: capacidades del evento (lo que el evento usa; el tipo no las decide) ---------- */
exports.EVENT_CAPABILITIES = [
    "INFO", "LOCATION", "REGISTRATION", "PARTICIPANTS", "CHECKIN", "ROUTE", "POINTS", "CONTACTS", "CERTIFICATES",
    "VOLUNTEERS", "COMMUNICATIONS", "DOCUMENTS",
];
/** Reservadas: el servidor las rechaza hasta que exista su módulo (también hay CHECK en la BD). A5.1 habilitó VOLUNTEERS. */
exports.RESERVED_EVENT_CAPABILITIES = ["COMMUNICATIONS", "DOCUMENTS"];
exports.IMPLEMENTED_EVENT_CAPABILITIES = exports.EVENT_CAPABILITIES.filter((c) => !exports.RESERVED_EVENT_CAPABILITIES.includes(c));
/**
 * Valor inicial si el alta no indica capacidades: lo mismo que antes de A4 (todo lo implementado hasta A4).
 * VOLUNTEERS (A5.1) se activa por evento cuando se necesita; no forma parte del valor inicial.
 */
exports.DEFAULT_EVENT_CAPABILITIES = exports.IMPLEMENTED_EVENT_CAPABILITIES.filter((c) => c !== "VOLUNTEERS");
exports.EVENT_CAPABILITY_LABEL = {
    INFO: "Información", LOCATION: "Lugar", REGISTRATION: "Inscripción", PARTICIPANTS: "Participantes", CHECKIN: "Asistencia",
    ROUTE: "Trayecto", POINTS: "Puntos", CONTACTS: "Contactos", CERTIFICATES: "Certificado",
    VOLUNTEERS: "Voluntarios", COMMUNICATIONS: "Comunicaciones", DOCUMENTS: "Documentos",
};
/** Dependencias que impone el modelo de datos (también hay CHECK en la BD). */
exports.EVENT_CAPABILITY_REQUIRES = {
    REGISTRATION: ["PARTICIPANTS"], // aprobar una inscripción crea un Participant
    CHECKIN: ["PARTICIPANTS", "POINTS"], // Checkin referencia Participant y Checkpoint
    CERTIFICATES: ["PARTICIPANTS"],
};
/** INFO siempre está: nombre y fecha son obligatorios en todo evento. */
function validateEventCapabilities(caps) {
    const issues = [];
    if (new Set(caps).size !== caps.length)
        issues.push({ field: "capabilities", message: "Hay capacidades repetidas." });
    if (!caps.includes("INFO"))
        issues.push({ field: "capabilities", message: "La información básica del evento no se puede desactivar." });
    for (const c of caps) {
        if (exports.RESERVED_EVENT_CAPABILITIES.includes(c)) {
            issues.push({ field: "capabilities", message: `«${exports.EVENT_CAPABILITY_LABEL[c]}» todavía no está disponible.` });
        }
        for (const r of exports.EVENT_CAPABILITY_REQUIRES[c] ?? []) {
            if (!caps.includes(r))
                issues.push({ field: "capabilities", message: `«${exports.EVENT_CAPABILITY_LABEL[c]}» requiere «${exports.EVENT_CAPABILITY_LABEL[r]}».` });
        }
    }
    return issues;
}
const hasEventCapability = (e, c) => e.capabilities.includes(c);
exports.hasEventCapability = hasEventCapability;
/** Estados en los que el evento no admite operación (llegadas, altas desde inscripciones). */
const isEventOperable = (s) => s === "SCHEDULED" || s === "IN_PROGRESS";
exports.isEventOperable = isEventOperable;
/* ---------- Tipos de evento (la peregrinación es un tipo especializado, no otra app) ---------- */
exports.EVENT_TYPES = [
    "PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY",
    "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER",
];
/** Etiqueta de cada tipo. A4: el tipo ya no habilita módulos; eso lo deciden las capacidades del evento. */
exports.EVENT_TYPE_INFO = {
    PILGRIMAGE: { label: "Peregrinación" },
    PROCESSION: { label: "Procesión" },
    PATRONAL_FEAST: { label: "Fiesta patronal" },
    LITURGICAL_CELEBRATION: { label: "Celebración litúrgica" },
    ROSARY: { label: "Rosario" },
    RETREAT: { label: "Retiro" },
    GATHERING: { label: "Encuentro" },
    COMMUNITY_ACTIVITY: { label: "Actividad comunitaria" },
    CULTURAL_ACTIVITY: { label: "Actividad cultural" },
    OTHER: { label: "Otro" },
};
exports.EVENT_VISIBILITIES = ["PRIVATE", "UNLISTED", "PUBLIC"];
exports.EVENT_VISIBILITY_LABEL = {
    PRIVATE: "Privado (solo personal)", UNLISTED: "Solo con enlace", PUBLIC: "Público",
};
const OPERATOR = ["event:read", "participant:read", "checkpoint:read", "checkin:create"];
const ADMIN = [
    ...OPERATOR, "participant:manage", "checkpoint:manage", "checkin:read", "checkin:correct",
    "report:read", "export:run", "assignment:manage", "participant:create", "contact:manage", "invitation:manage", "payment:review", "credential:export",
    "volunteer:manage",
];
const SUPERADMIN = [...ADMIN, "event:create", "event:update", "user:manage", "backup:run", "audit:read"];
exports.ROLE_PERMISSIONS = {
    SUPERADMIN: new Set(SUPERADMIN),
    ADMIN: new Set(ADMIN),
    OPERATOR: new Set(OPERATOR),
};
function can(role, permission) {
    return exports.ROLE_PERMISSIONS[role].has(permission);
}
/* ---------- Esquemas Zod ---------- */
const email = zod_1.z.string().trim().toLowerCase().email().max(200);
const password = zod_1.z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(128);
/*
 * A1 (deny-by-default): los cuerpos que crean cuentas o asignan roles son .strict().
 * Cualquier campo no declarado (role, accountType, organizationId, isSuperadmin…) produce 400.
 */
exports.loginSchema = zod_1.z.object({ email, password: zod_1.z.string().min(1).max(128) }).strict();
/* =====================  A5.0: CUENTA DEL PEREGRINO  ===================== */
/** Reenvío de verificación y pedido de recuperación: solo el correo (la respuesta nunca revela si existe). */
exports.accountEmailSchema = zod_1.z.object({ email }).strict();
/** Restablecer con el token del correo (llega en el cuerpo, nunca en la URL de la API). */
exports.passwordResetConfirmSchema = zod_1.z.object({ token: zod_1.z.string().min(20).max(200), password }).strict();
/** Cambio de contraseña con la sesión iniciada: exige la contraseña actual. */
exports.changePasswordSchema = zod_1.z.object({ currentPassword: zod_1.z.string().min(1).max(128), newPassword: password }).strict()
    .refine((v) => v.currentPassword !== v.newPassword, { message: "La contraseña nueva debe ser distinta de la actual", path: ["newPassword"] });
exports.registerPilgrimSchema = zod_1.z.object({
    firstName: zod_1.z.string().trim().min(2, "El nombre es obligatorio").max(80),
    lastName: zod_1.z.string().trim().min(2, "El apellido es obligatorio").max(80),
    email,
    documentNumber: zod_1.z.string().trim().min(5, "El documento es obligatorio").max(30),
    phone: zod_1.z.string().trim().min(6, "El teléfono es obligatorio").max(30),
    password,
    acceptTerms: zod_1.z.literal(true, {
        errorMap: () => ({ message: "Debes aceptar los términos y condiciones" }),
    }),
    // A4a: sin código de vinculación. El canje solo se hace después, desde la cuenta con el email verificado.
}).strict();
/* =====================  A4a: PERSON (identidad humana, independiente de la cuenta)  ===================== */
const personDocument = zod_1.z.string().trim().max(25)
    .refine((v) => /^[0-9A-Za-z]{5,20}$/.test((0, exports.normalizeDocument)(v)), "Documento no válido");
const personPhone = zod_1.z.string().trim().max(30)
    .refine((v) => (0, exports.digitsOnly)(v).length >= 7 && (0, exports.digitsOnly)(v).length <= 15, "Teléfono no válido");
/** Ningún dato de contacto es obligatorio: una persona sin tecnología puede no tener correo ni teléfono. */
const personFields = {
    firstName: zod_1.z.string().trim().min(1, "Falta el nombre").max(80),
    lastName: zod_1.z.string().trim().max(80).optional(),
    documentType: zod_1.z.string().trim().max(10).optional(),
    documentNumber: personDocument.optional(),
    phone: personPhone.optional(),
    email: zod_1.z.string().trim().toLowerCase().email().max(200).optional(),
    birthDate: zod_1.z.coerce.date().refine((d) => d <= new Date(), "La fecha de nacimiento no puede ser futura").optional(),
};
/** Alta manual por el personal. Si hay coincidencias, se pide confirmar (confirmNewPerson) o elegir la existente. */
exports.createPersonSchema = zod_1.z.object({ ...personFields, confirmNewPerson: zod_1.z.literal(true).optional() }).strict();
exports.updatePersonSchema = zod_1.z.object(personFields).partial().strict();
exports.personListSchema = zod_1.z.object({
    q: zod_1.z.string().trim().max(80).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(25),
});
/** Fusión explícita de duplicados: nunca automática. */
exports.mergePersonSchema = zod_1.z.object({ intoPersonId: zod_1.z.string().uuid(), confirm: zod_1.z.literal(true) }).strict();
/** El titular canjea desde su cuenta (email verificado) el código que le entregó la organización (prueba de posesión). */
exports.claimPersonSchema = zod_1.z.object({
    code: zod_1.z.string().trim().min(10).max(20),
    /** A5.0: confirmación explícita del titular para unir el registro de la organización a su cuenta. */
    confirm: zod_1.z.literal(true, { errorMap: () => ({ message: "Confirma que quieres unir este registro a tu cuenta" }) }),
}).strict();
/** Desvinculación de una cuenta por la organización dueña de la Person: siempre con motivo (queda auditado). */
exports.unlinkAccountSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(5, "Indica el motivo").max(500) }).strict();
exports.bootstrapSchema = zod_1.z.object({
    organizationName: zod_1.z.string().trim().min(2).max(120),
    name: zod_1.z.string().trim().min(2).max(120),
    email,
    password,
}).strict();
const lat = zod_1.z.coerce.number().min(-90).max(90);
const lng = zod_1.z.coerce.number().min(-180).max(180);
const optText = (max) => zod_1.z.string().trim().max(max).nullable().optional();
/** Trayecto (origen → destino). Requiere la capacidad ROUTE. */
exports.eventRouteSchema = zod_1.z.object({
    originName: optText(160),
    originAddress: optText(240),
    originLat: lat.nullable().optional(),
    originLng: lng.nullable().optional(),
    destinationName: optText(160),
    destinationAddress: optText(240),
    destinationLat: lat.nullable().optional(),
    destinationLng: lng.nullable().optional(),
    distanceKm: zod_1.z.coerce.number().min(0).max(99_999).nullable().optional(),
});
/**
 * Opciones propias de cada tipo (columna Event.settings). Hoy ningún tipo define opciones:
 * cada fase agrega aquí los campos que necesite, sin tocar el modelo Event.
 */
const noSettings = zod_1.z.object({}).strict();
exports.eventSettingsSchemas = {
    PILGRIMAGE: noSettings, PROCESSION: noSettings, PATRONAL_FEAST: noSettings, LITURGICAL_CELEBRATION: noSettings,
    ROSARY: noSettings, RETREAT: noSettings, GATHERING: noSettings, COMMUNITY_ACTIVITY: noSettings,
    CULTURAL_ACTIVITY: noSettings, OTHER: noSettings,
};
/** Campos comunes de alta/edición. Las reglas entre campos se validan con validateEventCoherence. */
const eventFields = {
    name: zod_1.z.string().trim().min(3).max(160),
    description: zod_1.z.string().trim().max(2000).optional(),
    type: zod_1.z.enum(exports.EVENT_TYPES),
    startsAt: zod_1.z.coerce.date(),
    endsAt: zod_1.z.coerce.date().nullable().optional(),
    /** Zona horaria IANA del evento: todas sus fechas se muestran en ella. */
    timezone: zod_1.z.string().trim().refine(locale_1.isValidTimeZone, "Zona horaria inválida (usa un nombre IANA, p. ej. America/Argentina/Buenos_Aires).").default(locale_1.DEFAULT_TIMEZONE),
    status: zod_1.z.enum(exports.EVENT_STATUSES).default("DRAFT"),
    /** A4: capacidades del evento. Sin indicar, el alta usa DEFAULT_EVENT_CAPABILITIES. */
    capabilities: zod_1.z.array(zod_1.z.enum(exports.EVENT_CAPABILITIES)).max(exports.EVENT_CAPABILITIES.length).optional(),
    /** Nombre de la parroquia que se imprime en la credencial. */
    parishName: optText(160),
    locationName: optText(160),
    address: optText(240),
    latitude: lat.nullable().optional(),
    longitude: lng.nullable().optional(),
    capacity: zod_1.z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
    visibility: zod_1.z.enum(exports.EVENT_VISIBILITIES).optional(),
    registrationOpen: zod_1.z.boolean().optional(),
    registrationOpensAt: zod_1.z.coerce.date().nullable().optional(),
    registrationClosesAt: zod_1.z.coerce.date().nullable().optional(),
    registrationFee: zod_1.z.coerce.number().min(0).max(100_000_000).nullable().optional(),
    paymentInstructions: optText(1500),
    certificateEnabled: zod_1.z.boolean().optional(),
    certificatePhrase: optText(300),
    settings: zod_1.z.record(zod_1.z.unknown()).optional(),
    /** null quita el trayecto. */
    route: exports.eventRouteSchema.nullable().optional(),
};
/** Sin `type` se asume OTHER (compatibilidad con clientes que aún no lo envían). */
exports.createEventSchema = zod_1.z.object({ ...eventFields, type: eventFields.type.default("OTHER"), status: zod_1.z.enum(exports.EVENT_INITIAL_STATUSES).default("DRAFT") });
exports.updateEventSchema = zod_1.z.object(eventFields).partial();
exports.eventListQuerySchema = zod_1.z.object({
    type: zod_1.z.enum(exports.EVENT_TYPES).optional(),
    status: zod_1.z.enum(exports.EVENT_STATUSES).optional(),
});
/**
 * Reglas entre campos sobre el estado final del evento (ya combinado con lo guardado).
 * Devuelve la lista de problemas; vacía si todo es coherente.
 */
function validateEventCoherence(e) {
    const issues = [];
    if (e.endsAt && e.endsAt < e.startsAt)
        issues.push({ field: "endsAt", message: "La finalización no puede ser anterior al inicio." });
    if (e.registrationOpensAt && e.registrationClosesAt && e.registrationClosesAt < e.registrationOpensAt) {
        issues.push({ field: "registrationClosesAt", message: "El cierre de inscripción no puede ser anterior a la apertura." });
    }
    if ((e.latitude == null) !== (e.longitude == null))
        issues.push({ field: "latitude", message: "Indica latitud y longitud juntas." });
    issues.push(...validateEventCapabilities(e.capabilities));
    const off = (c) => !e.capabilities.includes(c);
    if (e.hasRoute && off("ROUTE"))
        issues.push({ field: "route", message: "El evento no tiene activado el trayecto. Quita el trayecto o activa «Trayecto»." });
    if (e.hasLocation && off("LOCATION"))
        issues.push({ field: "locationName", message: "El evento no tiene activado el lugar. Quita los datos del lugar o activa «Lugar»." });
    if (e.registrationOpen && off("REGISTRATION"))
        issues.push({ field: "registrationOpen", message: "El evento no tiene activada la inscripción." });
    if (e.certificateEnabled && off("CERTIFICATES"))
        issues.push({ field: "certificateEnabled", message: "El evento no tiene activado el certificado." });
    const s = exports.eventSettingsSchemas[e.type].safeParse(e.settings ?? {});
    if (!s.success)
        issues.push({ field: "settings", message: "Configuración no válida para este tipo de evento." });
    return issues;
}
/**
 * A4: estado de la inscripción, DERIVADO (no se guarda y nunca cambia el estado del evento).
 * DISABLED: sin capacidad REGISTRATION · CLOSED: interruptor apagado, evento no publicado/en curso o ventana vencida
 * · NOT_YET_OPEN: antes de registrationOpensAt · FULL: participantes ACTIVE >= capacity · OPEN: admite inscripciones.
 * El cupo cuenta solo Participant ACTIVE: las inscripciones pendientes no lo consumen.
 */
exports.REGISTRATION_STATES = ["DISABLED", "NOT_YET_OPEN", "OPEN", "FULL", "CLOSED"];
/** Cupo agotado: solo con capacity definido; cuenta únicamente participantes ACTIVE. */
const isCapacityFull = (capacity, activeParticipants) => capacity != null && activeParticipants >= capacity;
exports.isCapacityFull = isCapacityFull;
function deriveRegistrationState(e, now = new Date()) {
    if (!e.capabilities.includes("REGISTRATION"))
        return "DISABLED";
    if (!e.registrationOpen || !(0, exports.isEventOperable)(e.status))
        return "CLOSED";
    if (e.registrationClosesAt && now > e.registrationClosesAt)
        return "CLOSED";
    if (e.registrationOpensAt && now < e.registrationOpensAt)
        return "NOT_YET_OPEN";
    if ((0, exports.isCapacityFull)(e.capacity, e.activeParticipants))
        return "FULL";
    return "OPEN";
}
/** Inscripción abierta ahora (capacidad + interruptor + estado operable + ventana opcional). */
const isRegistrationOpenNow = (e, now = new Date()) => deriveRegistrationState(e, now) === "OPEN";
exports.isRegistrationOpenNow = isRegistrationOpenNow;
function deriveAttendance(p) {
    if (p.activeCheckins > 0)
        return "ATTENDED";
    if (p.eventStatus === "FINISHED" && p.participantStatus === "ACTIVE")
        return "NO_SHOW";
    return null;
}
exports.createUserSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(120),
    email,
    password,
    role: zod_1.z.enum(exports.ROLES),
    extraPermissions: zod_1.z.array(zod_1.z.enum(["participant:create", "checkin:read", "report:read"])).default([]),
}).strict();
exports.updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(120).optional(),
    role: zod_1.z.enum(exports.ROLES).optional(),
    isActive: zod_1.z.boolean().optional(),
    password: password.optional(),
    extraPermissions: zod_1.z.array(zod_1.z.enum(["participant:create", "checkin:read", "report:read"])).optional(),
}).strict();
exports.assignmentsSchema = zod_1.z.object({
    checkpointIds: zod_1.z.array(zod_1.z.string().uuid()).max(50),
});
exports.paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(25),
});
const isMfaChallenge = (v) => typeof v === "object" && v !== null && v.mfaRequired === true;
exports.isMfaChallenge = isMfaChallenge;
const totpCode = zod_1.z.string().trim().regex(/^\d{3}\s?\d{3}$/, "Código de 6 dígitos").transform((v) => v.replace(/\s/g, ""));
const recoveryCode = zod_1.z.string().trim().min(10).max(14).regex(/^[A-Za-z0-9-\s]+$/, "Código de recuperación no válido");
/** Segundo paso del login y step-up: un código TOTP o un código de recuperación (exactamente uno). */
exports.mfaVerifySchema = zod_1.z
    .object({ code: totpCode.optional(), recoveryCode: recoveryCode.optional() })
    .strict()
    .refine((v) => (v.code ? 1 : 0) + (v.recoveryCode ? 1 : 0) === 1, { message: "Ingresa un código", path: ["code"] });
/** Confirmar el enrolamiento: el primer código generado por la app. */
exports.mfaConfirmSchema = zod_1.z.object({ code: totpCode }).strict();
/** Desactivar MFA o regenerar códigos: exige la contraseña además del step-up. */
exports.mfaPasswordSchema = zod_1.z.object({ password: zod_1.z.string().min(1).max(128) }).strict();
/** Número visible con ceros: 1 -> "001" */
const formatParticipantNumber = (n) => String(n).padStart(3, "0");
exports.formatParticipantNumber = formatParticipantNumber;
/* =====================  FASE 2  ===================== */
/** A4: participación oficial confirmada (ACTIVE) o cancelada. La asistencia se deriva (deriveAttendance). */
exports.PARTICIPANT_STATUSES = ["ACTIVE", "CANCELLED"];
exports.CHECKIN_METHODS = ["NUMBER", "QR", "SEARCH"];
/** Prefijo del contenido del QR: "PG1:<token opaco>". Nunca lleva datos personales. */
exports.QR_PREFIX = "PG1:";
const qrContent = (token) => exports.QR_PREFIX + token;
exports.qrContent = qrContent;
const parseQrContent = (raw) => {
    const t = raw.trim();
    return t.startsWith(exports.QR_PREFIX) && t.length > exports.QR_PREFIX.length + 8 ? t.slice(exports.QR_PREFIX.length) : null;
};
exports.parseQrContent = parseQrContent;
const normalizeDocument = (s) => s.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
exports.normalizeDocument = normalizeDocument;
const digitsOnly = (s) => s.replace(/\D/g, "");
exports.digitsOnly = digitsOnly;
const participantBase = {
    firstName: zod_1.z.string().trim().min(1, "Falta el nombre").max(80),
    lastName: zod_1.z.string().trim().min(1, "Falta el apellido").max(80),
    documentNumber: zod_1.z.string().trim().min(1, "Falta el documento").max(25)
        .refine((v) => /^[0-9A-Za-z]{5,20}$/.test((0, exports.normalizeDocument)(v)) && (0, exports.normalizeDocument)(v).length >= 5, "Documento no válido"),
    phone: zod_1.z.string().trim().min(1, "Falta el teléfono").max(30)
        .refine((v) => (0, exports.digitsOnly)(v).length >= 7 && (0, exports.digitsOnly)(v).length <= 15, "Teléfono no válido"),
    documentType: zod_1.z.string().trim().max(10).default("DNI"),
    notes: zod_1.z.string().trim().max(500).optional(),
    number: zod_1.z.coerce.number().int().min(1).max(999999).optional(),
};
/**
 * A4a: la participación pertenece a una Person. personId elige una existente de la organización; sin personId se crea
 * una nueva, salvo que haya coincidencias por documento o teléfono: entonces se exige elegir o confirmNewPerson.
 */
exports.createParticipantSchema = zod_1.z.object({
    ...participantBase,
    personId: zod_1.z.string().uuid().optional(),
    confirmNewPerson: zod_1.z.literal(true).optional(),
});
exports.updateParticipantSchema = zod_1.z.object(participantBase).partial()
    .extend({ status: zod_1.z.enum(exports.PARTICIPANT_STATUSES).optional() });
exports.participantListSchema = exports.paginationSchema.extend({
    q: zod_1.z.string().trim().max(80).optional(),
    status: zod_1.z.enum(exports.PARTICIPANT_STATUSES).optional(),
});
const latlng = {
    latitude: zod_1.z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: zod_1.z.coerce.number().min(-180).max(180).nullable().optional(),
};
exports.createCheckpointSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(120),
    description: zod_1.z.string().trim().max(500).optional(),
    address: zod_1.z.string().trim().max(200).optional(),
    reference: zod_1.z.string().trim().max(200).optional(),
    capacity: zod_1.z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
    status: zod_1.z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
    ...latlng,
});
exports.updateCheckpointSchema = exports.createCheckpointSchema.partial();
exports.reorderCheckpointsSchema = zod_1.z.object({ checkpointIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(200) });
exports.createCheckinSchema = zod_1.z.object({
    /** UUID generado por el dispositivo: hace idempotente el envío. */
    id: zod_1.z.string().uuid().optional(),
    participantId: zod_1.z.string().uuid(),
    checkpointId: zod_1.z.string().uuid(),
    method: zod_1.z.enum(exports.CHECKIN_METHODS),
    timestamp: zod_1.z.coerce.date().optional(),
    latitude: zod_1.z.coerce.number().min(-90).max(90).optional(),
    longitude: zod_1.z.coerce.number().min(-180).max(180).optional(),
    deviceId: zod_1.z.string().trim().max(100).optional(),
});
exports.cancelCheckinSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(3, "Indica el motivo").max(300) });
exports.correctCheckinSchema = zod_1.z.object({
    reason: zod_1.z.string().trim().min(3, "Indica el motivo").max(300),
    timestamp: zod_1.z.coerce.date().optional(),
    checkpointId: zod_1.z.string().uuid().optional(),
}).refine((v) => v.timestamp || v.checkpointId, "Indica qué corregir: hora o punto");
exports.resolveConflictSchema = zod_1.z.object({
    action: zod_1.z.enum(["KEEP_ORIGINAL", "USE_THIS"]),
    reason: zod_1.z.string().trim().max(300).optional(),
});
exports.checkinListSchema = exports.paginationSchema.extend({
    checkpointId: zod_1.z.string().uuid().optional(),
    participantId: zod_1.z.string().uuid().optional(),
    operatorId: zod_1.z.string().uuid().optional(),
    method: zod_1.z.enum(exports.CHECKIN_METHODS).optional(),
    status: zod_1.z.enum(["ACTIVE", "CANCELLED", "CONFLICT"]).optional(),
    from: zod_1.z.coerce.date().optional(),
    to: zod_1.z.coerce.date().optional(),
});
/* =====================  FASE 3A  ===================== */
/** Permisos que un administrador puede activar individualmente a un operador. */
exports.GRANTABLE_PERMISSIONS = ["participant:create", "checkin:read", "report:read"];
function effectivePermissions(role, extras = []) {
    const set = new Set(exports.ROLE_PERMISSIONS[role]);
    for (const e of extras)
        if (exports.GRANTABLE_PERMISSIONS.includes(e))
            set.add(e);
    if (set.has("participant:manage"))
        set.add("participant:create");
    return [...set];
}
const hasPermission = (role, extras, p) => effectivePermissions(role, extras).includes(p);
exports.hasPermission = hasPermission;
/** Nadie puede dar un nivel superior al suyo: el Superadmin da cualquiera; el Administrador solo nivel operador. */
const canGrantRole = (granter, target) => granter === "SUPERADMIN" || (granter === "ADMIN" && target === "OPERATOR");
exports.canGrantRole = canGrantRole;
/**
 * A1: roles que se pueden otorgar por invitación o alta directa. SUPERADMIN queda excluido:
 * solo se otorga promoviendo a un miembro activo del personal (PATCH /users/:id), con un único
 * punto de control en el servidor. Una invitación es un enlace al portador y no debe dar SUPERADMIN.
 */
const canInviteRole = (granter, target) => target !== "SUPERADMIN" && (0, exports.canGrantRole)(granter, target);
exports.canInviteRole = canInviteRole;
/** Niveles listos para elegir al invitar. */
exports.ACCESS_LEVELS = [
    { id: "OPERATOR_POINT", label: "Operador de punto", description: "Solo chequea llegadas en sus puntos", role: "OPERATOR", extraPermissions: [] },
    { id: "OPERATOR_PLUS", label: "Operador con altas", description: "Chequea llegadas y agrega participantes", role: "OPERATOR", extraPermissions: ["participant:create"] },
    { id: "ADMIN", label: "Administrador", description: "Gestiona personas, puntos, historial y reportes", role: "ADMIN", extraPermissions: [] },
    { id: "SUPERADMIN", label: "Superadministrador", description: "Acceso total, incluidos usuarios y eventos", role: "SUPERADMIN", extraPermissions: [] },
];
exports.createInvitationSchema = zod_1.z.object({
    email,
    role: zod_1.z.enum(exports.ROLES),
    extraPermissions: zod_1.z.array(zod_1.z.enum(exports.GRANTABLE_PERMISSIONS)).default([]),
    checkpointIds: zod_1.z.array(zod_1.z.string().uuid()).max(50).default([]),
}).strict().refine((v) => v.role === "OPERATOR" || v.checkpointIds.length === 0, {
    message: "Solo los operadores tienen puntos asignados", path: ["checkpointIds"],
});
exports.acceptInvitationSchema = zod_1.z.object({
    token: zod_1.z.string().min(20).max(200),
    name: zod_1.z.string().trim().min(2).max(120),
    password,
}).strict();
/* =====================  A3: SOLICITUDES DE PARROQUIA Y PLATAFORMA  ===================== */
const reqText = (min, max) => zod_1.z.string().trim().min(min).max(max);
const optReqText = (max) => zod_1.z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const organizationRequestFields = {
    parishName: reqText(3, 160),
    contactName: reqText(2, 120),
    contactEmail: email,
    contactPhone: optReqText(30),
    /** ISO 3166-1 alfa-2 (catálogo internacional G1). */
    countryCode: zod_1.z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Código de país ISO 3166-1 alfa-2"),
    locality: optReqText(160),
    address: optReqText(240),
    notes: optReqText(2000),
};
/** Solicitud pública de una nueva parroquia. No incluye estado, rol ni organización: los decide la plataforma. */
exports.organizationRequestSchema = zod_1.z.object({
    ...organizationRequestFields,
    acceptTerms: zod_1.z.literal(true, { errorMap: () => ({ message: "Debes aceptar los términos y condiciones" }) }),
}).strict();
/** Corrección y nueva presentación de una solicitud rechazada (con el token privado del solicitante). */
exports.resubmitOrganizationRequestSchema = zod_1.z.object({ token: zod_1.z.string().min(20).max(200), ...organizationRequestFields }).strict();
exports.organizationRequestTokenSchema = zod_1.z.object({ token: zod_1.z.string().min(20).max(200) }).strict();
/** Revisión por PLATFORM. El motivo es obligatorio para rechazar y suspender. */
exports.platformApproveSchema = zod_1.z.object({ note: zod_1.z.string().trim().max(2000).optional() }).strict();
exports.platformRejectSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(5).max(2000) }).strict();
exports.organizationTransitionSchema = zod_1.z.object({
    to: zod_1.z.enum(exports.ORGANIZATION_STATUSES),
    reason: zod_1.z.string().trim().max(2000).optional(),
}).strict();
/** Presentación a revisión por el SUPERADMIN de la parroquia (DRAFT/REJECTED → PENDING_REVIEW). */
exports.submitOrganizationReviewSchema = zod_1.z.object({ note: zod_1.z.string().trim().max(2000).optional() }).strict();
exports.pilgrimLoginSchema = zod_1.z.object({
    token: zod_1.z.string().trim().min(20).max(200).optional(),
    code: zod_1.z.string().trim().min(8).max(20).optional(),
}).refine((v) => v.token || v.code, "Indica el enlace o el código");
exports.issueAccessSchema = zod_1.z.object({
    participantIds: zod_1.z.array(zod_1.z.string().uuid()).max(5000).optional(),
    /** false: solo a quienes aún no tienen acceso. true: reemite (el enlace anterior deja de funcionar). */
    reissue: zod_1.z.boolean().default(false),
});
exports.createContactSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(120),
    roleLabel: zod_1.z.string().trim().max(120).optional(),
    phone: zod_1.z.string().trim().min(7).max(30),
    email: zod_1.z.string().trim().toLowerCase().email().max(200).optional(),
    notes: zod_1.z.string().trim().max(300).optional(),
    checkpointId: zod_1.z.string().uuid().nullable().optional(),
    isEmergency: zod_1.z.boolean().default(false),
    sortOrder: zod_1.z.coerce.number().int().min(0).max(1000).default(0),
});
exports.updateContactSchema = exports.createContactSchema.partial();
/* =====================  INSCRIPCIÓN, COMPROBANTES Y CREDENCIALES  ===================== */
/** Booleano de query string: "true"/"1" => true. (z.coerce.boolean convertiría "false" y "0" en true.) */
exports.qBool = zod_1.z.enum(["true", "false", "1", "0"]).default("false").transform((v) => v === "true" || v === "1");
exports.REGISTRATION_STATUSES = ["PENDING_PROOF", "IN_REVIEW", "APPROVED", "REJECTED", "CANCELLED"];
exports.createRegistrationSchema = zod_1.z.object({
    token: zod_1.z.string().min(20).max(200),
    firstName: participantBase.firstName,
    lastName: participantBase.lastName,
    documentNumber: participantBase.documentNumber,
    phone: participantBase.phone,
});
const emptyToUndef = (v) => (v === "" || v === null ? undefined : v);
exports.proofFieldsSchema = zod_1.z.object({
    amount: zod_1.z.preprocess(emptyToUndef, zod_1.z.coerce.number().positive().max(100_000_000).optional()),
    reference: zod_1.z.preprocess(emptyToUndef, zod_1.z.string().trim().max(60).optional()),
    paidAt: zod_1.z.preprocess(emptyToUndef, zod_1.z.coerce.date().optional()),
    note: zod_1.z.preprocess(emptyToUndef, zod_1.z.string().trim().max(300).optional()),
});
exports.registrationListSchema = exports.paginationSchema.extend({
    status: zod_1.z.enum(exports.REGISTRATION_STATUSES).optional(),
    q: zod_1.z.string().trim().max(80).optional(),
});
exports.approveRegistrationSchema = zod_1.z.object({
    /** Opcional: número a asignar. Si falta, se toma el siguiente libre. */
    number: zod_1.z.coerce.number().int().min(1).max(999999).optional(),
    /** Para pagos en efectivo u otros casos sin comprobante. Queda en la auditoría. */
    withoutProof: zod_1.z.boolean().default(false),
});
exports.rejectRegistrationSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(3, "Indica el motivo").max(300) });
/** A4: el personal reabre una inscripción rechazada (REJECTED → IN_REVIEW). Siempre con motivo; aprobar sigue pasando por IN_REVIEW. */
exports.reopenRegistrationSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(3, "Indica el motivo").max(300) }).strict();
exports.credentialQuerySchema = zod_1.z.object({
    /** new: aún no impresas · all: todas las activas · ids: las indicadas en `ids`. */
    scope: zod_1.z.enum(["new", "all", "ids"]).default("new"),
    ids: zod_1.z.string().max(40_000).optional(),
    includeName: exports.qBool,
    /** Marca como impresas las credenciales exportadas. */
    mark: exports.qBool,
    page: zod_1.z.coerce.number().int().min(1).default(1),
});
/* =====================  A5.1: VOLUNTARIOS  ===================== */
/**
 * Estado de la participación como voluntario (no es un rol de cuenta). ASSIGNED/ACTIVE no son estados:
 * se derivan de las asignaciones vigentes y de los turnos.
 */
exports.VOLUNTEER_STATUSES = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "WITHDRAWN", "REVOKED", "COMPLETED"];
exports.VOLUNTEER_STATUS_LABEL = {
    REQUESTED: "Solicitado", UNDER_REVIEW: "En revisión", APPROVED: "Aprobado", REJECTED: "Rechazado",
    WITHDRAWN: "Se retiró", REVOKED: "Dado de baja", COMPLETED: "Finalizado",
};
/** Alta por el personal: como candidato (REQUESTED) o ya aprobado. */
exports.VOLUNTEER_INITIAL_STATUSES = ["REQUESTED", "APPROVED"];
exports.VOLUNTEER_TRANSITIONS = {
    REQUESTED: ["UNDER_REVIEW", "APPROVED", "REJECTED", "WITHDRAWN"],
    UNDER_REVIEW: ["APPROVED", "REJECTED", "WITHDRAWN"],
    APPROVED: ["COMPLETED", "REVOKED", "WITHDRAWN"],
    REJECTED: [], WITHDRAWN: [], REVOKED: [], COMPLETED: [],
};
const canTransitionVolunteer = (from, to) => exports.VOLUNTEER_TRANSITIONS[from].includes(to);
exports.canTransitionVolunteer = canTransitionVolunteer;
/** Rechazar o dar de baja exige motivo. */
exports.VOLUNTEER_REASON_REQUIRED = ["REJECTED", "REVOKED"];
/** Alta de voluntario: una Person existente (visible para la organización) o una nueva (con confirmación de duplicados). */
exports.createVolunteerSchema = zod_1.z.object({
    personId: zod_1.z.string().uuid().optional(),
    firstName: zod_1.z.string().trim().min(1).max(80).optional(),
    lastName: zod_1.z.string().trim().max(80).optional(),
    documentNumber: zod_1.z.string().trim().max(25).optional(),
    phone: zod_1.z.string().trim().max(30).optional(),
    email: zod_1.z.string().trim().toLowerCase().email().max(200).optional(),
    confirmNewPerson: zod_1.z.literal(true).optional(),
    status: zod_1.z.enum(exports.VOLUNTEER_INITIAL_STATUSES).default("APPROVED"),
    notes: zod_1.z.string().trim().max(500).optional(),
}).strict().refine((v) => !!v.personId || !!v.firstName, { message: "Elige una persona o indica al menos el nombre", path: ["firstName"] });
/**
 * A5.1: canje por la organización del código que la persona generó en su cuenta (para el evento de la ruta). Solo el
 * código: crea una solicitud que la persona acepta o rechaza; nunca identifica a la persona por otros datos.
 */
exports.volunteerConsentRequestSchema = zod_1.z.object({ code: zod_1.z.string().trim().min(10).max(20) }).strict();
/** A5.1: vigencia del código de consentimiento y, una vez canjeado, de la solicitud. */
exports.VOLUNTEER_CONSENT_CODE_HOURS = 72;
/** A5.1: estado derivado de una solicitud de consentimiento (no se persiste). */
exports.VOLUNTEER_REQUEST_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"];
exports.VOLUNTEER_REQUEST_STATUS_LABEL = {
    PENDING: "Pendiente", ACCEPTED: "Aceptada", DECLINED: "Rechazada", EXPIRED: "Vencida",
};
exports.volunteerTransitionSchema = zod_1.z.object({
    to: zod_1.z.enum(exports.VOLUNTEER_STATUSES),
    reason: zod_1.z.string().trim().min(3).max(500).optional(),
}).strict();
/** Equipos, zonas y funciones: nombres libres que define la organización (sin enums). */
exports.catalogItemSchema = zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(80), description: zod_1.z.string().trim().max(300).optional() }).strict();
exports.catalogUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(80).optional(),
    description: zod_1.z.string().trim().max(300).nullable().optional(),
    isActive: zod_1.z.boolean().optional(),
}).strict();
const shiftBase = {
    name: zod_1.z.string().trim().max(80).optional(),
    startsAt: zod_1.z.coerce.date(),
    endsAt: zod_1.z.coerce.date(),
    zoneId: zod_1.z.string().uuid().nullable().optional(),
    teamId: zod_1.z.string().uuid().nullable().optional(),
};
exports.createShiftSchema = zod_1.z.object(shiftBase).strict()
    .refine((v) => v.endsAt > v.startsAt, { message: "El turno debe terminar después de empezar", path: ["endsAt"] });
exports.updateShiftSchema = zod_1.z.object({ ...shiftBase, startsAt: shiftBase.startsAt.optional(), endsAt: shiftBase.endsAt.optional(), cancel: zod_1.z.literal(true).optional() }).strict();
exports.createAssignmentSchema = zod_1.z.object({
    volunteerId: zod_1.z.string().uuid(),
    functionId: zod_1.z.string().uuid(),
    teamId: zod_1.z.string().uuid().optional(),
    zoneId: zod_1.z.string().uuid().optional(),
    shiftId: zod_1.z.string().uuid().optional(),
}).strict();
exports.revokeAssignmentSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(300) }).strict();
/* =====================  Idiomas y formato  ===================== */
__exportStar(require("./locale"), exports);
