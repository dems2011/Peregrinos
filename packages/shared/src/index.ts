import { z } from "zod";

/* ---------- Roles y permisos (única fuente de verdad: API y Web) ---------- */
export const ROLES = ["SUPERADMIN", "ADMIN", "OPERATOR"] as const;
export type Role = (typeof ROLES)[number];
export type AccountType = "STAFF" | "PILGRIM";

/** DRAFT: en preparación, no operativo · SCHEDULED: programado · IN_PROGRESS: activo · FINISHED: cerrado · CANCELLED: cancelado. */
export const EVENT_STATUSES = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELLED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: "Borrador", SCHEDULED: "Programado", IN_PROGRESS: "En curso", FINISHED: "Finalizado", CANCELLED: "Cancelado",
};
/** Estados en los que el evento no admite operación (llegadas, altas desde inscripciones). */
export const isEventOperable = (s: EventStatus) => s === "SCHEDULED" || s === "IN_PROGRESS";

/* ---------- Tipos de evento (la peregrinación es un tipo especializado, no otra app) ---------- */
export const EVENT_TYPES = [
  "PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY",
  "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Qué habilita cada tipo. hasRoute: admite trayecto (EventRoute) y la gestión de recorrido. */
export const EVENT_TYPE_INFO: Record<EventType, { label: string; hasRoute: boolean }> = {
  PILGRIMAGE: { label: "Peregrinación", hasRoute: true },
  PROCESSION: { label: "Procesión", hasRoute: true },
  PATRONAL_FEAST: { label: "Fiesta patronal", hasRoute: false },
  LITURGICAL_CELEBRATION: { label: "Celebración litúrgica", hasRoute: false },
  ROSARY: { label: "Rosario", hasRoute: false },
  RETREAT: { label: "Retiro", hasRoute: false },
  GATHERING: { label: "Encuentro", hasRoute: false },
  COMMUNITY_ACTIVITY: { label: "Actividad comunitaria", hasRoute: false },
  CULTURAL_ACTIVITY: { label: "Actividad cultural", hasRoute: false },
  OTHER: { label: "Otro", hasRoute: false },
};

export const EVENT_VISIBILITIES = ["PRIVATE", "UNLISTED", "PUBLIC"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];
export const EVENT_VISIBILITY_LABEL: Record<EventVisibility, string> = {
  PRIVATE: "Privado (solo personal)", UNLISTED: "Solo con enlace", PUBLIC: "Público",
};

export type Permission =
  | "event:read" | "event:create" | "event:update"
  | "user:manage" | "assignment:manage"
  | "participant:read" | "participant:create" | "participant:manage"
  | "checkpoint:read" | "checkpoint:manage"
  | "checkin:create" | "checkin:read" | "checkin:correct"
  | "report:read" | "export:run" | "backup:run" | "audit:read"
  | "contact:manage" | "invitation:manage" | "payment:review" | "credential:export";

const OPERATOR: Permission[] = ["event:read", "participant:read", "checkpoint:read", "checkin:create"];
const ADMIN: Permission[] = [
  ...OPERATOR, "participant:manage", "checkpoint:manage", "checkin:read", "checkin:correct",
  "report:read", "export:run", "assignment:manage", "participant:create", "contact:manage", "invitation:manage", "payment:review", "credential:export",
];
const SUPERADMIN: Permission[] = [...ADMIN, "event:create", "event:update", "user:manage", "backup:run", "audit:read"];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SUPERADMIN: new Set(SUPERADMIN),
  ADMIN: new Set(ADMIN),
  OPERATOR: new Set(OPERATOR),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/* ---------- Esquemas Zod ---------- */
const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(128);

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const registerPilgrimSchema = z.object({
  firstName: z.string().trim().min(2, "El nombre es obligatorio").max(80),
  lastName: z.string().trim().min(2, "El apellido es obligatorio").max(80),
  email,
  documentNumber: z.string().trim().min(5, "El DNI es obligatorio").max(30),
  phone: z.string().trim().min(6, "El teléfono es obligatorio").max(30),
  password,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar los términos y condiciones" }),
  }),
});

export const bootstrapSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email,
  password,
});

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Trayecto (origen → destino). Solo para tipos con EVENT_TYPE_INFO[type].hasRoute. */
export const eventRouteSchema = z.object({
  originName: optText(160),
  originAddress: optText(240),
  originLat: lat.nullable().optional(),
  originLng: lng.nullable().optional(),
  destinationName: optText(160),
  destinationAddress: optText(240),
  destinationLat: lat.nullable().optional(),
  destinationLng: lng.nullable().optional(),
  distanceKm: z.coerce.number().min(0).max(99_999).nullable().optional(),
});
export type EventRouteInput = z.infer<typeof eventRouteSchema>;

/**
 * Opciones propias de cada tipo (columna Event.settings). Hoy ningún tipo define opciones:
 * cada fase agrega aquí los campos que necesite, sin tocar el modelo Event.
 */
const noSettings = z.object({}).strict();
export const eventSettingsSchemas: Record<EventType, z.ZodTypeAny> = {
  PILGRIMAGE: noSettings, PROCESSION: noSettings, PATRONAL_FEAST: noSettings, LITURGICAL_CELEBRATION: noSettings,
  ROSARY: noSettings, RETREAT: noSettings, GATHERING: noSettings, COMMUNITY_ACTIVITY: noSettings,
  CULTURAL_ACTIVITY: noSettings, OTHER: noSettings,
};

/** Campos comunes de alta/edición. Las reglas entre campos se validan con validateEventCoherence. */
const eventFields = {
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(EVENT_TYPES),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  timezone: z.string().default("America/Argentina/Buenos_Aires"),
  status: z.enum(EVENT_STATUSES).default("DRAFT"),
  /** Nombre de la parroquia que se imprime en la credencial. */
  parishName: optText(160),
  locationName: optText(160),
  address: optText(240),
  latitude: lat.nullable().optional(),
  longitude: lng.nullable().optional(),
  capacity: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  visibility: z.enum(EVENT_VISIBILITIES).optional(),
  registrationOpen: z.boolean().optional(),
  registrationOpensAt: z.coerce.date().nullable().optional(),
  registrationClosesAt: z.coerce.date().nullable().optional(),
  registrationFee: z.coerce.number().min(0).max(100_000_000).nullable().optional(),
  paymentInstructions: optText(1500),
  certificateEnabled: z.boolean().optional(),
  certificatePhrase: optText(300),
  settings: z.record(z.unknown()).optional(),
  /** null quita el trayecto. */
  route: eventRouteSchema.nullable().optional(),
};
/** Sin `type` se asume OTHER (compatibilidad con clientes que aún no lo envían). */
export const createEventSchema = z.object({ ...eventFields, type: eventFields.type.default("OTHER") });
export const updateEventSchema = z.object(eventFields).partial();
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const eventListQuerySchema = z.object({
  type: z.enum(EVENT_TYPES).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
});

/**
 * Reglas entre campos sobre el estado final del evento (ya combinado con lo guardado).
 * Devuelve la lista de problemas; vacía si todo es coherente.
 */
export function validateEventCoherence(e: {
  type: EventType; startsAt: Date; endsAt?: Date | null;
  registrationOpensAt?: Date | null; registrationClosesAt?: Date | null;
  settings?: unknown; hasRoute: boolean; latitude?: number | null; longitude?: number | null;
}): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = [];
  if (e.endsAt && e.endsAt < e.startsAt) issues.push({ field: "endsAt", message: "La finalización no puede ser anterior al inicio." });
  if (e.registrationOpensAt && e.registrationClosesAt && e.registrationClosesAt < e.registrationOpensAt) {
    issues.push({ field: "registrationClosesAt", message: "El cierre de inscripción no puede ser anterior a la apertura." });
  }
  if ((e.latitude == null) !== (e.longitude == null)) issues.push({ field: "latitude", message: "Indica latitud y longitud juntas." });
  if (e.hasRoute && !EVENT_TYPE_INFO[e.type].hasRoute) {
    issues.push({ field: "route", message: `Un evento de tipo «${EVENT_TYPE_INFO[e.type].label}» no tiene trayecto. Quita el trayecto antes de cambiar el tipo.` });
  }
  const s = eventSettingsSchemas[e.type].safeParse(e.settings ?? {});
  if (!s.success) issues.push({ field: "settings", message: "Configuración no válida para este tipo de evento." });
  return issues;
}

/** Inscripción abierta ahora: interruptor + estado operable + ventana opcional. */
export function isRegistrationOpenNow(
  e: { registrationOpen: boolean; status: EventStatus; registrationOpensAt?: Date | null; registrationClosesAt?: Date | null },
  now = new Date(),
): boolean {
  if (!e.registrationOpen || !isEventOperable(e.status)) return false;
  if (e.registrationOpensAt && now < e.registrationOpensAt) return false;
  if (e.registrationClosesAt && now > e.registrationClosesAt) return false;
  return true;
}

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  password,
  role: z.enum(ROLES),
  extraPermissions: z.array(z.enum(["participant:create", "checkin:read", "report:read"])).default([]),
});
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
  extraPermissions: z.array(z.enum(["participant:create", "checkin:read", "report:read"])).optional(),
});

export const assignmentsSchema = z.object({
  checkpointIds: z.array(z.string().uuid()).max(50),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/* ---------- Tipos de respuesta ---------- */
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
export const formatParticipantNumber = (n: number) => String(n).padStart(3, "0");


/* =====================  FASE 2  ===================== */
export const PARTICIPANT_STATUSES = ["ACTIVE", "INACTIVE", "CANCELLED"] as const;
export const CHECKIN_METHODS = ["NUMBER", "QR", "SEARCH"] as const;
export type CheckinMethod = (typeof CHECKIN_METHODS)[number];

/** Prefijo del contenido del QR: "PG1:<token opaco>". Nunca lleva datos personales. */
export const QR_PREFIX = "PG1:";
export const qrContent = (token: string) => QR_PREFIX + token;
export const parseQrContent = (raw: string): string | null => {
  const t = raw.trim();
  return t.startsWith(QR_PREFIX) && t.length > QR_PREFIX.length + 8 ? t.slice(QR_PREFIX.length) : null;
};

export const normalizeDocument = (s: string) => s.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
export const digitsOnly = (s: string) => s.replace(/\D/g, "");

const participantBase = {
  firstName: z.string().trim().min(1, "Falta el nombre").max(80),
  lastName: z.string().trim().min(1, "Falta el apellido").max(80),
  documentNumber: z.string().trim().min(1, "Falta el documento").max(25)
    .refine((v) => /^[0-9A-Za-z]{5,20}$/.test(normalizeDocument(v)) && normalizeDocument(v).length >= 5, "Documento no válido"),
  phone: z.string().trim().min(1, "Falta el teléfono").max(30)
    .refine((v) => digitsOnly(v).length >= 7 && digitsOnly(v).length <= 15, "Teléfono no válido"),
  documentType: z.string().trim().max(10).default("DNI"),
  notes: z.string().trim().max(500).optional(),
  number: z.coerce.number().int().min(1).max(999999).optional(),
};
export const createParticipantSchema = z.object(participantBase);
export const updateParticipantSchema = z.object(participantBase).partial()
  .extend({ status: z.enum(PARTICIPANT_STATUSES).optional() });

export const participantListSchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
  status: z.enum(PARTICIPANT_STATUSES).optional(),
});

const latlng = {
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
};
export const createCheckpointSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  address: z.string().trim().max(200).optional(),
  reference: z.string().trim().max(200).optional(),
  capacity: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  ...latlng,
});
export const updateCheckpointSchema = createCheckpointSchema.partial();
export const reorderCheckpointsSchema = z.object({ checkpointIds: z.array(z.string().uuid()).min(1).max(200) });

export const createCheckinSchema = z.object({
  /** UUID generado por el dispositivo: hace idempotente el envío. */
  id: z.string().uuid().optional(),
  participantId: z.string().uuid(),
  checkpointId: z.string().uuid(),
  method: z.enum(CHECKIN_METHODS),
  timestamp: z.coerce.date().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  deviceId: z.string().trim().max(100).optional(),
});
export const cancelCheckinSchema = z.object({ reason: z.string().trim().min(3, "Indica el motivo").max(300) });
export const correctCheckinSchema = z.object({
  reason: z.string().trim().min(3, "Indica el motivo").max(300),
  timestamp: z.coerce.date().optional(),
  checkpointId: z.string().uuid().optional(),
}).refine((v) => v.timestamp || v.checkpointId, "Indica qué corregir: hora o punto");
export const resolveConflictSchema = z.object({
  action: z.enum(["KEEP_ORIGINAL", "USE_THIS"]),
  reason: z.string().trim().max(300).optional(),
});
export const checkinListSchema = paginationSchema.extend({
  checkpointId: z.string().uuid().optional(),
  participantId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
  method: z.enum(CHECKIN_METHODS).optional(),
  status: z.enum(["ACTIVE", "CANCELLED", "CONFLICT"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});


/* =====================  FASE 3A  ===================== */
/** Permisos que un administrador puede activar individualmente a un operador. */
export const GRANTABLE_PERMISSIONS = ["participant:create", "checkin:read", "report:read"] as const;
export type GrantablePermission = (typeof GRANTABLE_PERMISSIONS)[number];

export function effectivePermissions(role: Role, extras: readonly string[] = []): Permission[] {
  const set = new Set<Permission>(ROLE_PERMISSIONS[role]);
  for (const e of extras) if ((GRANTABLE_PERMISSIONS as readonly string[]).includes(e)) set.add(e as Permission);
  if (set.has("participant:manage")) set.add("participant:create");
  return [...set];
}
export const hasPermission = (role: Role, extras: readonly string[], p: Permission) =>
  effectivePermissions(role, extras).includes(p);

/** Nadie puede dar un nivel superior al suyo: el Superadmin da cualquiera; el Administrador solo nivel operador. */
export const canGrantRole = (granter: Role, target: Role) =>
  granter === "SUPERADMIN" || (granter === "ADMIN" && target === "OPERATOR");

/** Niveles listos para elegir al invitar. */
export const ACCESS_LEVELS = [
  { id: "OPERATOR_POINT", label: "Operador de punto", description: "Solo chequea llegadas en sus puntos", role: "OPERATOR" as Role, extraPermissions: [] as GrantablePermission[] },
  { id: "OPERATOR_PLUS", label: "Operador con altas", description: "Chequea llegadas y agrega participantes", role: "OPERATOR" as Role, extraPermissions: ["participant:create"] as GrantablePermission[] },
  { id: "ADMIN", label: "Administrador", description: "Gestiona personas, puntos, historial y reportes", role: "ADMIN" as Role, extraPermissions: [] as GrantablePermission[] },
  { id: "SUPERADMIN", label: "Superadministrador", description: "Acceso total, incluidos usuarios y eventos", role: "SUPERADMIN" as Role, extraPermissions: [] as GrantablePermission[] },
] as const;

export const createInvitationSchema = z.object({
  email,
  role: z.enum(ROLES),
  extraPermissions: z.array(z.enum(GRANTABLE_PERMISSIONS)).default([]),
  checkpointIds: z.array(z.string().uuid()).max(50).default([]),
}).refine((v) => v.role === "OPERATOR" || v.checkpointIds.length === 0, {
  message: "Solo los operadores tienen puntos asignados", path: ["checkpointIds"],
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(120),
  password,
});

export const pilgrimLoginSchema = z.object({
  token: z.string().trim().min(20).max(200).optional(),
  code: z.string().trim().min(8).max(20).optional(),
}).refine((v) => v.token || v.code, "Indica el enlace o el código");

export const issueAccessSchema = z.object({
  participantIds: z.array(z.string().uuid()).max(5000).optional(),
  /** false: solo a quienes aún no tienen acceso. true: reemite (el enlace anterior deja de funcionar). */
  reissue: z.boolean().default(false),
});

export const createContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  roleLabel: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  notes: z.string().trim().max(300).optional(),
  checkpointId: z.string().uuid().nullable().optional(),
  isEmergency: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});
export const updateContactSchema = createContactSchema.partial();

export interface PilgrimMe {
  stage: "OFFICIAL";
  participant: { number: number; firstName: string; lastName: string; documentMasked: string };
  /** Contenido exacto del QR ("PG1:<token>"). */
  qrContent: string;
  event: {
    id: string; name: string; description: string | null; startsAt: string; status: EventStatus; timezone: string;
    type: EventType; endsAt: string | null; locationName: string | null; address: string | null;
  };
  route: { checkpointId: string; order: number; name: string; address: string | null; reference: string | null; latitude: number | null; longitude: number | null; arrived: boolean; timestamp: string | null }[];
  progress: { done: number; total: number; percent: number };
  contacts: { id: string; name: string; roleLabel: string | null; phone: string; email: string | null; notes: string | null; isEmergency: boolean; checkpointName: string | null }[];
}
export type SessionResponse =
  | { kind: "staff"; me: MeResponse }
  | { kind: "pilgrim" }
  | { kind: "none" };


/* =====================  INSCRIPCIÓN, COMPROBANTES Y CREDENCIALES  ===================== */
/** Booleano de query string: "true"/"1" => true. (z.coerce.boolean convertiría "false" y "0" en true.) */
export const qBool = z.enum(["true", "false", "1", "0"]).default("false").transform((v) => v === "true" || v === "1");

export const REGISTRATION_STATUSES = ["PENDING_PROOF", "IN_REVIEW", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const createRegistrationSchema = z.object({
  token: z.string().min(20).max(200),
  firstName: participantBase.firstName,
  lastName: participantBase.lastName,
  documentNumber: participantBase.documentNumber,
  phone: participantBase.phone,
});

const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);
export const proofFieldsSchema = z.object({
  amount: z.preprocess(emptyToUndef, z.coerce.number().positive().max(100_000_000).optional()),
  reference: z.preprocess(emptyToUndef, z.string().trim().max(60).optional()),
  paidAt: z.preprocess(emptyToUndef, z.coerce.date().optional()),
  note: z.preprocess(emptyToUndef, z.string().trim().max(300).optional()),
});

export const registrationListSchema = paginationSchema.extend({
  status: z.enum(REGISTRATION_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
});
export const approveRegistrationSchema = z.object({
  /** Opcional: número a asignar. Si falta, se toma el siguiente libre. */
  number: z.coerce.number().int().min(1).max(999999).optional(),
  /** Para pagos en efectivo u otros casos sin comprobante. Queda en la auditoría. */
  withoutProof: z.boolean().default(false),
});
export const rejectRegistrationSchema = z.object({ reason: z.string().trim().min(3, "Indica el motivo").max(300) });

export const credentialQuerySchema = z.object({
  /** new: aún no impresas · all: todas las activas · ids: las indicadas en `ids`. */
  scope: z.enum(["new", "all", "ids"]).default("new"),
  ids: z.string().max(40_000).optional(),
  includeName: qBool,
  /** Marca como impresas las credenciales exportadas. */
  mark: qBool,
  page: z.coerce.number().int().min(1).default(1),
});

export interface PilgrimRegistrationMe {
  stage: "REGISTRATION";
  registration: {
    firstName: string; lastName: string; documentMasked: string; status: RegistrationStatus;
    rejectionReason: string | null; proofsSent: number; lastProofAt: string | null;
  };
  event: {
    id: string; name: string; parishName: string; startsAt: string; registrationFee: string | null; paymentInstructions: string | null;
    type: EventType; endsAt: string | null; locationName: string | null; address: string | null;
  };
  contacts: PilgrimMe["contacts"];
}
