import { z } from "zod";
import { DEFAULT_TIMEZONE, isValidTimeZone } from "./locale";

/* ---------- Roles y permisos (única fuente de verdad: API y Web) ---------- */
export const ROLES = ["SUPERADMIN", "ADMIN", "OPERATOR"] as const;
export type Role = (typeof ROLES)[number];
/** STAFF: personal de una parroquia · PILGRIM: identidad del peregrino · PLATFORM: operador de plataforma (A3). */
export type AccountType = "STAFF" | "PILGRIM" | "PLATFORM";

/* ---------- A3: ciclo de vida de organizaciones ---------- */
export const ORGANIZATION_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "ARCHIVED"] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
export const ORGANIZATION_STATUS_LABEL: Record<OrganizationStatus, string> = {
  DRAFT: "Borrador", PENDING_REVIEW: "En revisión", APPROVED: "Aprobada", REJECTED: "Rechazada", SUSPENDED: "Suspendida", ARCHIVED: "Archivada",
};

/**
 * Ciclo de vida del evento (independiente del de la inscripción).
 * DRAFT: en preparación · SCHEDULED: publicado · IN_PROGRESS: en curso · FINISHED: finalizado · CANCELLED: cancelado.
 */
export const EVENT_STATUSES = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELLED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: "Borrador", SCHEDULED: "Publicado", IN_PROGRESS: "En curso", FINISHED: "Finalizado", CANCELLED: "Cancelado",
};
/** A4: estados con los que se puede crear un evento (crear publicado = DRAFT → SCHEDULED en un paso). */
export const EVENT_INITIAL_STATUSES = ["DRAFT", "SCHEDULED"] as const satisfies readonly EventStatus[];
/** A4: únicas transiciones permitidas. FINISHED y CANCELLED son terminales. */
export const EVENT_TRANSITIONS: Readonly<Record<EventStatus, readonly EventStatus[]>> = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["DRAFT", "IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["FINISHED", "CANCELLED"],
  FINISHED: [],
  CANCELLED: [],
};
export const canTransitionEvent = (from: EventStatus, to: EventStatus) => EVENT_TRANSITIONS[from].includes(to);

/* ---------- A4: capacidades del evento (lo que el evento usa; el tipo no las decide) ---------- */
export const EVENT_CAPABILITIES = [
  "INFO", "LOCATION", "REGISTRATION", "PARTICIPANTS", "CHECKIN", "ROUTE", "POINTS", "CONTACTS", "CERTIFICATES",
  "VOLUNTEERS", "COMMUNICATIONS", "DOCUMENTS",
] as const;
export type EventCapability = (typeof EVENT_CAPABILITIES)[number];
/** Reservadas: el servidor las rechaza hasta que exista su módulo (también hay CHECK en la BD). A5.1 habilitó VOLUNTEERS. */
export const RESERVED_EVENT_CAPABILITIES = ["COMMUNICATIONS", "DOCUMENTS"] as const satisfies readonly EventCapability[];
export type ImplementedEventCapability = Exclude<EventCapability, (typeof RESERVED_EVENT_CAPABILITIES)[number]>;
export const IMPLEMENTED_EVENT_CAPABILITIES = EVENT_CAPABILITIES.filter(
  (c): c is ImplementedEventCapability => !(RESERVED_EVENT_CAPABILITIES as readonly string[]).includes(c),
);
/**
 * Valor inicial si el alta no indica capacidades: lo mismo que antes de A4 (todo lo implementado hasta A4).
 * VOLUNTEERS (A5.1) se activa por evento cuando se necesita; no forma parte del valor inicial.
 */
export const DEFAULT_EVENT_CAPABILITIES: readonly EventCapability[] = IMPLEMENTED_EVENT_CAPABILITIES.filter((c) => c !== "VOLUNTEERS");
export const EVENT_CAPABILITY_LABEL: Record<EventCapability, string> = {
  INFO: "Información", LOCATION: "Lugar", REGISTRATION: "Inscripción", PARTICIPANTS: "Participantes", CHECKIN: "Asistencia",
  ROUTE: "Trayecto", POINTS: "Puntos", CONTACTS: "Contactos", CERTIFICATES: "Certificado",
  VOLUNTEERS: "Voluntarios", COMMUNICATIONS: "Comunicaciones", DOCUMENTS: "Documentos",
};
/** Dependencias que impone el modelo de datos (también hay CHECK en la BD). */
export const EVENT_CAPABILITY_REQUIRES: Partial<Record<EventCapability, readonly EventCapability[]>> = {
  REGISTRATION: ["PARTICIPANTS"], // aprobar una inscripción crea un Participant
  CHECKIN: ["PARTICIPANTS", "POINTS"], // Checkin referencia Participant y Checkpoint
  CERTIFICATES: ["PARTICIPANTS"],
};
/** INFO siempre está: nombre y fecha son obligatorios en todo evento. */
export function validateEventCapabilities(caps: readonly EventCapability[]): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = [];
  if (new Set(caps).size !== caps.length) issues.push({ field: "capabilities", message: "Hay capacidades repetidas." });
  if (!caps.includes("INFO")) issues.push({ field: "capabilities", message: "La información básica del evento no se puede desactivar." });
  for (const c of caps) {
    if ((RESERVED_EVENT_CAPABILITIES as readonly string[]).includes(c)) {
      issues.push({ field: "capabilities", message: `«${EVENT_CAPABILITY_LABEL[c]}» todavía no está disponible.` });
    }
    for (const r of EVENT_CAPABILITY_REQUIRES[c] ?? []) {
      if (!caps.includes(r)) issues.push({ field: "capabilities", message: `«${EVENT_CAPABILITY_LABEL[c]}» requiere «${EVENT_CAPABILITY_LABEL[r]}».` });
    }
  }
  return issues;
}
export const hasEventCapability = (e: { capabilities: readonly string[] }, c: EventCapability) => e.capabilities.includes(c);
/** Estados en los que el evento no admite operación (llegadas, altas desde inscripciones). */
export const isEventOperable = (s: EventStatus) => s === "SCHEDULED" || s === "IN_PROGRESS";

/* ---------- Tipos de evento (la peregrinación es un tipo especializado, no otra app) ---------- */
export const EVENT_TYPES = [
  "PILGRIMAGE", "PROCESSION", "PATRONAL_FEAST", "LITURGICAL_CELEBRATION", "ROSARY",
  "RETREAT", "GATHERING", "COMMUNITY_ACTIVITY", "CULTURAL_ACTIVITY", "OTHER",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Etiqueta de cada tipo. A4: el tipo ya no habilita módulos; eso lo deciden las capacidades del evento. */
export const EVENT_TYPE_INFO: Record<EventType, { label: string }> = {
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
  | "contact:manage" | "invitation:manage" | "payment:review" | "credential:export"
  /** A5.1: gestionar voluntarios, equipos, zonas, funciones, turnos y asignaciones de los eventos de la organización. */
  | "volunteer:manage";

const OPERATOR: Permission[] = ["event:read", "participant:read", "checkpoint:read", "checkin:create"];
const ADMIN: Permission[] = [
  ...OPERATOR, "participant:manage", "checkpoint:manage", "checkin:read", "checkin:correct",
  "report:read", "export:run", "assignment:manage", "participant:create", "contact:manage", "invitation:manage", "payment:review", "credential:export",
  "volunteer:manage",
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

/*
 * A1 (deny-by-default): los cuerpos que crean cuentas o asignan roles son .strict().
 * Cualquier campo no declarado (role, accountType, organizationId, isSuperadmin…) produce 400.
 */
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();

/* =====================  A5.0: CUENTA DEL PEREGRINO  ===================== */
/** Reenvío de verificación y pedido de recuperación: solo el correo (la respuesta nunca revela si existe). */
export const accountEmailSchema = z.object({ email }).strict();
/** Restablecer con el token del correo (llega en el cuerpo, nunca en la URL de la API). */
export const passwordResetConfirmSchema = z.object({ token: z.string().min(20).max(200), password }).strict();
/** Cambio de contraseña con la sesión iniciada: exige la contraseña actual. */
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict()
  .refine((v) => v.currentPassword !== v.newPassword, { message: "La contraseña nueva debe ser distinta de la actual", path: ["newPassword"] });
export const registerPilgrimSchema = z.object({
  firstName: z.string().trim().min(2, "El nombre es obligatorio").max(80),
  lastName: z.string().trim().min(2, "El apellido es obligatorio").max(80),
  email,
  documentNumber: z.string().trim().min(5, "El documento es obligatorio").max(30),
  phone: z.string().trim().min(6, "El teléfono es obligatorio").max(30),
  password,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar los términos y condiciones" }),
  }),
  // A4a: sin código de vinculación. El canje solo se hace después, desde la cuenta con el email verificado.
}).strict();

/* =====================  A4a: PERSON (identidad humana, independiente de la cuenta)  ===================== */
const personDocument = z.string().trim().max(25)
  .refine((v) => /^[0-9A-Za-z]{5,20}$/.test(normalizeDocument(v)), "Documento no válido");
const personPhone = z.string().trim().max(30)
  .refine((v) => digitsOnly(v).length >= 7 && digitsOnly(v).length <= 15, "Teléfono no válido");
/** Ningún dato de contacto es obligatorio: una persona sin tecnología puede no tener correo ni teléfono. */
const personFields = {
  firstName: z.string().trim().min(1, "Falta el nombre").max(80),
  lastName: z.string().trim().max(80).optional(),
  documentType: z.string().trim().max(10).optional(),
  documentNumber: personDocument.optional(),
  phone: personPhone.optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  birthDate: z.coerce.date().refine((d) => d <= new Date(), "La fecha de nacimiento no puede ser futura").optional(),
};
/** Alta manual por el personal. Si hay coincidencias, se pide confirmar (confirmNewPerson) o elegir la existente. */
export const createPersonSchema = z.object({ ...personFields, confirmNewPerson: z.literal(true).optional() }).strict();
export const updatePersonSchema = z.object(personFields).partial().strict();
export const personListSchema = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
/** Fusión explícita de duplicados: nunca automática. */
export const mergePersonSchema = z.object({ intoPersonId: z.string().uuid(), confirm: z.literal(true) }).strict();
/** El titular canjea desde su cuenta (email verificado) el código que le entregó la organización (prueba de posesión). */
export const claimPersonSchema = z.object({
  code: z.string().trim().min(10).max(20),
  /** A5.0: confirmación explícita del titular para unir el registro de la organización a su cuenta. */
  confirm: z.literal(true, { errorMap: () => ({ message: "Confirma que quieres unir este registro a tu cuenta" }) }),
}).strict();
/** Desvinculación de una cuenta por la organización dueña de la Person: siempre con motivo (queda auditado). */
export const unlinkAccountSchema = z.object({ reason: z.string().trim().min(5, "Indica el motivo").max(500) }).strict();

export const bootstrapSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email,
  password,
}).strict();

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Trayecto (origen → destino). Requiere la capacidad ROUTE. */
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
  /** Zona horaria IANA del evento: todas sus fechas se muestran en ella. */
  timezone: z.string().trim().refine(isValidTimeZone, "Zona horaria inválida (usa un nombre IANA, p. ej. America/Argentina/Buenos_Aires).").default(DEFAULT_TIMEZONE),
  status: z.enum(EVENT_STATUSES).default("DRAFT"),
  /** A4: capacidades del evento. Sin indicar, el alta usa DEFAULT_EVENT_CAPABILITIES. */
  capabilities: z.array(z.enum(EVENT_CAPABILITIES)).max(EVENT_CAPABILITIES.length).optional(),
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
export const createEventSchema = z.object({ ...eventFields, type: eventFields.type.default("OTHER"), status: z.enum(EVENT_INITIAL_STATUSES).default("DRAFT") });
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
  /** A4: capacidades finales y datos del propio evento que dependen de ellas. */
  capabilities: readonly EventCapability[];
  hasLocation: boolean; registrationOpen: boolean; certificateEnabled: boolean;
}): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = [];
  if (e.endsAt && e.endsAt < e.startsAt) issues.push({ field: "endsAt", message: "La finalización no puede ser anterior al inicio." });
  if (e.registrationOpensAt && e.registrationClosesAt && e.registrationClosesAt < e.registrationOpensAt) {
    issues.push({ field: "registrationClosesAt", message: "El cierre de inscripción no puede ser anterior a la apertura." });
  }
  if ((e.latitude == null) !== (e.longitude == null)) issues.push({ field: "latitude", message: "Indica latitud y longitud juntas." });
  issues.push(...validateEventCapabilities(e.capabilities));
  const off = (c: EventCapability) => !e.capabilities.includes(c);
  if (e.hasRoute && off("ROUTE")) issues.push({ field: "route", message: "El evento no tiene activado el trayecto. Quita el trayecto o activa «Trayecto»." });
  if (e.hasLocation && off("LOCATION")) issues.push({ field: "locationName", message: "El evento no tiene activado el lugar. Quita los datos del lugar o activa «Lugar»." });
  if (e.registrationOpen && off("REGISTRATION")) issues.push({ field: "registrationOpen", message: "El evento no tiene activada la inscripción." });
  if (e.certificateEnabled && off("CERTIFICATES")) issues.push({ field: "certificateEnabled", message: "El evento no tiene activado el certificado." });
  const s = eventSettingsSchemas[e.type].safeParse(e.settings ?? {});
  if (!s.success) issues.push({ field: "settings", message: "Configuración no válida para este tipo de evento." });
  return issues;
}

/**
 * A4: estado de la inscripción, DERIVADO (no se guarda y nunca cambia el estado del evento).
 * DISABLED: sin capacidad REGISTRATION · CLOSED: interruptor apagado, evento no publicado/en curso o ventana vencida
 * · NOT_YET_OPEN: antes de registrationOpensAt · FULL: participantes ACTIVE >= capacity · OPEN: admite inscripciones.
 * El cupo cuenta solo Participant ACTIVE: las inscripciones pendientes no lo consumen.
 */
export const REGISTRATION_STATES = ["DISABLED", "NOT_YET_OPEN", "OPEN", "FULL", "CLOSED"] as const;
export type RegistrationState = (typeof REGISTRATION_STATES)[number];
/** Cupo agotado: solo con capacity definido; cuenta únicamente participantes ACTIVE. */
export const isCapacityFull = (capacity: number | null | undefined, activeParticipants: number) =>
  capacity != null && activeParticipants >= capacity;
export function deriveRegistrationState(
  e: {
    capabilities: readonly string[]; registrationOpen: boolean; status: EventStatus;
    registrationOpensAt?: Date | null; registrationClosesAt?: Date | null;
    capacity?: number | null; activeParticipants: number;
  },
  now = new Date(),
): RegistrationState {
  if (!e.capabilities.includes("REGISTRATION")) return "DISABLED";
  if (!e.registrationOpen || !isEventOperable(e.status)) return "CLOSED";
  if (e.registrationClosesAt && now > e.registrationClosesAt) return "CLOSED";
  if (e.registrationOpensAt && now < e.registrationOpensAt) return "NOT_YET_OPEN";
  if (isCapacityFull(e.capacity, e.activeParticipants)) return "FULL";
  return "OPEN";
}
/** Inscripción abierta ahora (capacidad + interruptor + estado operable + ventana opcional). */
export const isRegistrationOpenNow = (e: Parameters<typeof deriveRegistrationState>[0], now = new Date()) =>
  deriveRegistrationState(e, now) === "OPEN";

/**
 * A4: asistencia DERIVADA (sin columna). ATTENDED: tiene al menos una llegada ACTIVE.
 * NO_SHOW: evento finalizado, participante ACTIVE y sin llegadas. null: todavía no se puede determinar.
 */
export type Attendance = "ATTENDED" | "NO_SHOW";
export function deriveAttendance(p: { eventStatus: EventStatus; participantStatus: string; activeCheckins: number }): Attendance | null {
  if (p.activeCheckins > 0) return "ATTENDED";
  if (p.eventStatus === "FINISHED" && p.participantStatus === "ACTIVE") return "NO_SHOW";
  return null;
}

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  password,
  role: z.enum(ROLES),
  extraPermissions: z.array(z.enum(["participant:create", "checkin:read", "report:read"])).default([]),
}).strict();
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
  extraPermissions: z.array(z.enum(["participant:create", "checkin:read", "report:read"])).optional(),
}).strict();

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

/* =====================  A6: MFA DEL PERSONAL  ===================== */
export interface MfaStatus {
  enabled: boolean;
  /** SUPERADMIN sin MFA: la sesión solo permite enrolarse (la API responde 403 MFA_ENROLLMENT_REQUIRED). */
  enrollmentRequired: boolean;
  /** Hasta cuándo vale el último segundo factor de esta sesión para acciones sensibles (ISO) o null. */
  stepUpValidUntil: string | null;
  recoveryCodesRemaining: number;
}
/** Login en dos pasos: la contraseña fue correcta y falta el segundo factor (no hay sesión todavía). */
export interface MfaChallengeResponse {
  mfaRequired: true;
}
export const isMfaChallenge = (v: unknown): v is MfaChallengeResponse =>
  typeof v === "object" && v !== null && (v as { mfaRequired?: unknown }).mfaRequired === true;

const totpCode = z.string().trim().regex(/^\d{3}\s?\d{3}$/, "Código de 6 dígitos").transform((v) => v.replace(/\s/g, ""));
const recoveryCode = z.string().trim().min(10).max(14).regex(/^[A-Za-z0-9-\s]+$/, "Código de recuperación no válido");
/** Segundo paso del login y step-up: un código TOTP o un código de recuperación (exactamente uno). */
export const mfaVerifySchema = z
  .object({ code: totpCode.optional(), recoveryCode: recoveryCode.optional() })
  .strict()
  .refine((v) => (v.code ? 1 : 0) + (v.recoveryCode ? 1 : 0) === 1, { message: "Ingresa un código", path: ["code"] });
/** Confirmar el enrolamiento: el primer código generado por la app. */
export const mfaConfirmSchema = z.object({ code: totpCode }).strict();
/** Desactivar MFA o regenerar códigos: exige la contraseña además del step-up. */
export const mfaPasswordSchema = z.object({ password: z.string().min(1).max(128) }).strict();

/** Número visible con ceros: 1 -> "001" */
export const formatParticipantNumber = (n: number) => String(n).padStart(3, "0");


/* =====================  FASE 2  ===================== */
/** A4: participación oficial confirmada (ACTIVE) o cancelada. La asistencia se deriva (deriveAttendance). */
export const PARTICIPANT_STATUSES = ["ACTIVE", "CANCELLED"] as const;
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
/**
 * A4a: la participación pertenece a una Person. personId elige una existente de la organización; sin personId se crea
 * una nueva, salvo que haya coincidencias por documento o teléfono: entonces se exige elegir o confirmNewPerson.
 */
export const createParticipantSchema = z.object({
  ...participantBase,
  personId: z.string().uuid().optional(),
  confirmNewPerson: z.literal(true).optional(),
});
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

/**
 * A1: roles que se pueden otorgar por invitación o alta directa. SUPERADMIN queda excluido:
 * solo se otorga promoviendo a un miembro activo del personal (PATCH /users/:id), con un único
 * punto de control en el servidor. Una invitación es un enlace al portador y no debe dar SUPERADMIN.
 */
export const canInviteRole = (granter: Role, target: Role) => target !== "SUPERADMIN" && canGrantRole(granter, target);

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
}).strict().refine((v) => v.role === "OPERATOR" || v.checkpointIds.length === 0, {
  message: "Solo los operadores tienen puntos asignados", path: ["checkpointIds"],
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(120),
  password,
}).strict();

/* =====================  A3: SOLICITUDES DE PARROQUIA Y PLATAFORMA  ===================== */
const reqText = (min: number, max: number) => z.string().trim().min(min).max(max);
const optReqText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const organizationRequestFields = {
  parishName: reqText(3, 160),
  contactName: reqText(2, 120),
  contactEmail: email,
  contactPhone: optReqText(30),
  /** ISO 3166-1 alfa-2 (catálogo internacional G1). */
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Código de país ISO 3166-1 alfa-2"),
  locality: optReqText(160),
  address: optReqText(240),
  notes: optReqText(2000),
};
/** Solicitud pública de una nueva parroquia. No incluye estado, rol ni organización: los decide la plataforma. */
export const organizationRequestSchema = z.object({
  ...organizationRequestFields,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Debes aceptar los términos y condiciones" }) }),
}).strict();
/** Corrección y nueva presentación de una solicitud rechazada (con el token privado del solicitante). */
export const resubmitOrganizationRequestSchema = z.object({ token: z.string().min(20).max(200), ...organizationRequestFields }).strict();
export const organizationRequestTokenSchema = z.object({ token: z.string().min(20).max(200) }).strict();
/** Revisión por PLATFORM. El motivo es obligatorio para rechazar y suspender. */
export const platformApproveSchema = z.object({ note: z.string().trim().max(2000).optional() }).strict();
export const platformRejectSchema = z.object({ reason: z.string().trim().min(5).max(2000) }).strict();
export const organizationTransitionSchema = z.object({
  to: z.enum(ORGANIZATION_STATUSES),
  reason: z.string().trim().max(2000).optional(),
}).strict();
/** Presentación a revisión por el SUPERADMIN de la parroquia (DRAFT/REJECTED → PENDING_REVIEW). */
export const submitOrganizationReviewSchema = z.object({ note: z.string().trim().max(2000).optional() }).strict();

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
/** A4: el personal reabre una inscripción rechazada (REJECTED → IN_REVIEW). Siempre con motivo; aprobar sigue pasando por IN_REVIEW. */
export const reopenRegistrationSchema = z.object({ reason: z.string().trim().min(3, "Indica el motivo").max(300) }).strict();

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

/* =====================  A5.1: VOLUNTARIOS  ===================== */
/**
 * Estado de la participación como voluntario (no es un rol de cuenta). ASSIGNED/ACTIVE no son estados:
 * se derivan de las asignaciones vigentes y de los turnos.
 */
export const VOLUNTEER_STATUSES = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "WITHDRAWN", "REVOKED", "COMPLETED"] as const;
export type VolunteerStatus = (typeof VOLUNTEER_STATUSES)[number];
export const VOLUNTEER_STATUS_LABEL: Record<VolunteerStatus, string> = {
  REQUESTED: "Solicitado", UNDER_REVIEW: "En revisión", APPROVED: "Aprobado", REJECTED: "Rechazado",
  WITHDRAWN: "Se retiró", REVOKED: "Dado de baja", COMPLETED: "Finalizado",
};
/** Alta por el personal: como candidato (REQUESTED) o ya aprobado. */
export const VOLUNTEER_INITIAL_STATUSES = ["REQUESTED", "APPROVED"] as const satisfies readonly VolunteerStatus[];
export const VOLUNTEER_TRANSITIONS: Readonly<Record<VolunteerStatus, readonly VolunteerStatus[]>> = {
  REQUESTED: ["UNDER_REVIEW", "APPROVED", "REJECTED", "WITHDRAWN"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "WITHDRAWN"],
  APPROVED: ["COMPLETED", "REVOKED", "WITHDRAWN"],
  REJECTED: [], WITHDRAWN: [], REVOKED: [], COMPLETED: [],
};
export const canTransitionVolunteer = (from: VolunteerStatus, to: VolunteerStatus) => VOLUNTEER_TRANSITIONS[from].includes(to);
/** Rechazar o dar de baja exige motivo. */
export const VOLUNTEER_REASON_REQUIRED: readonly VolunteerStatus[] = ["REJECTED", "REVOKED"];

/** Alta de voluntario: una Person existente (visible para la organización) o una nueva (con confirmación de duplicados). */
export const createVolunteerSchema = z.object({
  personId: z.string().uuid().optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  documentNumber: z.string().trim().max(25).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  confirmNewPerson: z.literal(true).optional(),
  status: z.enum(VOLUNTEER_INITIAL_STATUSES).default("APPROVED"),
  notes: z.string().trim().max(500).optional(),
}).strict().refine((v) => !!v.personId || !!v.firstName, { message: "Elige una persona o indica al menos el nombre", path: ["firstName"] });
/**
 * A5.1: canje por la organización del código que la persona generó en su cuenta (para el evento de la ruta). Solo el
 * código: crea una solicitud que la persona acepta o rechaza; nunca identifica a la persona por otros datos.
 */
export const volunteerConsentRequestSchema = z.object({ code: z.string().trim().min(10).max(20) }).strict();
/** A5.1: vigencia del código de consentimiento y, una vez canjeado, de la solicitud. */
export const VOLUNTEER_CONSENT_CODE_HOURS = 72;
/** A5.1: estado derivado de una solicitud de consentimiento (no se persiste). */
export const VOLUNTEER_REQUEST_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"] as const;
export type VolunteerRequestStatus = (typeof VOLUNTEER_REQUEST_STATUSES)[number];
export const VOLUNTEER_REQUEST_STATUS_LABEL: Record<VolunteerRequestStatus, string> = {
  PENDING: "Pendiente", ACCEPTED: "Aceptada", DECLINED: "Rechazada", EXPIRED: "Vencida",
};
export const volunteerTransitionSchema = z.object({
  to: z.enum(VOLUNTEER_STATUSES),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict();
/** Equipos, zonas y funciones: nombres libres que define la organización (sin enums). */
export const catalogItemSchema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional() }).strict();
export const catalogUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();
const shiftBase = {
  name: z.string().trim().max(80).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  zoneId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
};
export const createShiftSchema = z.object(shiftBase).strict()
  .refine((v) => v.endsAt > v.startsAt, { message: "El turno debe terminar después de empezar", path: ["endsAt"] });
export const updateShiftSchema = z.object({ ...shiftBase, startsAt: shiftBase.startsAt.optional(), endsAt: shiftBase.endsAt.optional(), cancel: z.literal(true).optional() }).strict();
export const createAssignmentSchema = z.object({
  volunteerId: z.string().uuid(),
  functionId: z.string().uuid(),
  teamId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
}).strict();
export const revokeAssignmentSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

/* =====================  Idiomas y formato  ===================== */
export * from "./locale";
