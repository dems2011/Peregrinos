"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.credentialQuerySchema = exports.rejectRegistrationSchema = exports.approveRegistrationSchema = exports.registrationListSchema = exports.proofFieldsSchema = exports.createRegistrationSchema = exports.REGISTRATION_STATUSES = exports.qBool = exports.updateContactSchema = exports.createContactSchema = exports.issueAccessSchema = exports.pilgrimLoginSchema = exports.acceptInvitationSchema = exports.createInvitationSchema = exports.ACCESS_LEVELS = exports.canGrantRole = exports.hasPermission = exports.GRANTABLE_PERMISSIONS = exports.checkinListSchema = exports.resolveConflictSchema = exports.correctCheckinSchema = exports.cancelCheckinSchema = exports.createCheckinSchema = exports.reorderCheckpointsSchema = exports.updateCheckpointSchema = exports.createCheckpointSchema = exports.participantListSchema = exports.updateParticipantSchema = exports.createParticipantSchema = exports.digitsOnly = exports.normalizeDocument = exports.parseQrContent = exports.qrContent = exports.QR_PREFIX = exports.CHECKIN_METHODS = exports.PARTICIPANT_STATUSES = exports.formatParticipantNumber = exports.paginationSchema = exports.assignmentsSchema = exports.updateUserSchema = exports.createUserSchema = exports.updateEventSchema = exports.createEventSchema = exports.bootstrapSchema = exports.registerPilgrimSchema = exports.loginSchema = exports.ROLE_PERMISSIONS = exports.EVENT_STATUSES = exports.ROLES = void 0;
exports.can = can;
exports.effectivePermissions = effectivePermissions;
const zod_1 = require("zod");
/* ---------- Roles y permisos (única fuente de verdad: API y Web) ---------- */
exports.ROLES = ["SUPERADMIN", "ADMIN", "OPERATOR"];
exports.EVENT_STATUSES = ["SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELLED"];
const OPERATOR = ["event:read", "participant:read", "checkpoint:read", "checkin:create"];
const ADMIN = [
    ...OPERATOR, "participant:manage", "checkpoint:manage", "checkin:read", "checkin:correct",
    "report:read", "export:run", "assignment:manage", "participant:create", "contact:manage", "invitation:manage", "payment:review", "credential:export",
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
exports.loginSchema = zod_1.z.object({ email, password: zod_1.z.string().min(1).max(128) });
exports.registerPilgrimSchema = zod_1.z.object({
    firstName: zod_1.z.string().trim().min(2, "El nombre es obligatorio").max(80),
    lastName: zod_1.z.string().trim().min(2, "El apellido es obligatorio").max(80),
    email,
    documentNumber: zod_1.z.string().trim().min(5, "El DNI es obligatorio").max(30),
    phone: zod_1.z.string().trim().min(6, "El teléfono es obligatorio").max(30),
    password,
    acceptTerms: zod_1.z.literal(true, {
        errorMap: () => ({ message: "Debes aceptar los términos y condiciones" }),
    }),
});
exports.bootstrapSchema = zod_1.z.object({
    organizationName: zod_1.z.string().trim().min(2).max(120),
    name: zod_1.z.string().trim().min(2).max(120),
    email,
    password,
});
exports.createEventSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(3).max(160),
    description: zod_1.z.string().trim().max(2000).optional(),
    startsAt: zod_1.z.coerce.date(),
    timezone: zod_1.z.string().default("America/Argentina/Buenos_Aires"),
    status: zod_1.z.enum(exports.EVENT_STATUSES).default("SCHEDULED"),
    /** Nombre de la parroquia que se imprime en la credencial. */
    parishName: zod_1.z.string().trim().max(160).nullable().optional(),
    registrationOpen: zod_1.z.boolean().optional(),
    registrationFee: zod_1.z.coerce.number().min(0).max(100_000_000).nullable().optional(),
    paymentInstructions: zod_1.z.string().trim().max(1500).nullable().optional(),
});
exports.updateEventSchema = exports.createEventSchema.partial();
exports.createUserSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(120),
    email,
    password,
    role: zod_1.z.enum(exports.ROLES),
    extraPermissions: zod_1.z.array(zod_1.z.enum(["participant:create", "checkin:read", "report:read"])).default([]),
});
exports.updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(120).optional(),
    role: zod_1.z.enum(exports.ROLES).optional(),
    isActive: zod_1.z.boolean().optional(),
    password: password.optional(),
    extraPermissions: zod_1.z.array(zod_1.z.enum(["participant:create", "checkin:read", "report:read"])).optional(),
});
exports.assignmentsSchema = zod_1.z.object({
    checkpointIds: zod_1.z.array(zod_1.z.string().uuid()).max(50),
});
exports.paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(25),
});
/** Número visible con ceros: 1 -> "001" */
const formatParticipantNumber = (n) => String(n).padStart(3, "0");
exports.formatParticipantNumber = formatParticipantNumber;
/* =====================  FASE 2  ===================== */
exports.PARTICIPANT_STATUSES = ["ACTIVE", "INACTIVE", "CANCELLED"];
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
exports.createParticipantSchema = zod_1.z.object(participantBase);
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
}).refine((v) => v.role === "OPERATOR" || v.checkpointIds.length === 0, {
    message: "Solo los operadores tienen puntos asignados", path: ["checkpointIds"],
});
exports.acceptInvitationSchema = zod_1.z.object({
    token: zod_1.z.string().min(20).max(200),
    name: zod_1.z.string().trim().min(2).max(120),
    password,
});
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
exports.credentialQuerySchema = zod_1.z.object({
    /** new: aún no impresas · all: todas las activas · ids: las indicadas en `ids`. */
    scope: zod_1.z.enum(["new", "all", "ids"]).default("new"),
    ids: zod_1.z.string().max(40_000).optional(),
    includeName: exports.qBool,
    /** Marca como impresas las credenciales exportadas. */
    mark: exports.qBool,
    page: zod_1.z.coerce.number().int().min(1).default(1),
});
