import type { OrganizationStatus } from "@peregrinos/shared";
import { AppError } from "./errors";

/**
 * A3 — Ciclo de vida de organizaciones. Lógica pura (sin BD): transiciones permitidas y capacidades por estado.
 * Organization.status es la fuente de verdad; isActive no la sustituye.
 */

export type LifecycleActor = "PLATFORM" | "ORG_SUPERADMIN";

/** Transiciones permitidas y quién puede ejecutarlas. Cualquier otra transición se rechaza. */
export const ORG_TRANSITIONS: ReadonlyArray<{ from: OrganizationStatus; to: OrganizationStatus; actor: LifecycleActor; reasonRequired: boolean }> = [
  { from: "DRAFT", to: "PENDING_REVIEW", actor: "ORG_SUPERADMIN", reasonRequired: false },
  { from: "REJECTED", to: "PENDING_REVIEW", actor: "ORG_SUPERADMIN", reasonRequired: false }, // nueva presentación tras corregir
  { from: "PENDING_REVIEW", to: "APPROVED", actor: "PLATFORM", reasonRequired: false },
  { from: "PENDING_REVIEW", to: "REJECTED", actor: "PLATFORM", reasonRequired: true },
  { from: "APPROVED", to: "SUSPENDED", actor: "PLATFORM", reasonRequired: true },
  { from: "APPROVED", to: "ARCHIVED", actor: "PLATFORM", reasonRequired: false },
  // Una suspendida nunca vuelve directo a APPROVED: PLATFORM la reabre a revisión controlada.
  { from: "SUSPENDED", to: "PENDING_REVIEW", actor: "PLATFORM", reasonRequired: true },
];

export function assertOrgTransition(from: OrganizationStatus, to: OrganizationStatus, actor: LifecycleActor, reason?: string | null) {
  const rule = ORG_TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!rule) throw new AppError(409, "INVALID_TRANSITION", `Transición no permitida: ${from} → ${to}.`);
  if (rule.actor !== actor) throw new AppError(403, "TRANSITION_NOT_ALLOWED_FOR_ACTOR", `La transición ${from} → ${to} no está permitida para este tipo de cuenta.`);
  if (rule.reasonRequired && !reason?.trim()) throw new AppError(400, "REASON_REQUIRED", `La transición ${from} → ${to} requiere un motivo.`);
}

/** Capacidades del personal según el estado de su organización. */
export type OrgCapability =
  | "WRITE"              // cualquier escritura administrativa (borradores, configuración, operación)
  | "PUBLISH_EVENT"      // pasar un evento a programado/en curso
  | "OPEN_REGISTRATION"  // abrir inscripciones de un evento
  | "INVITE_STAFF"       // invitar o dar de alta personal
  | "SUBMIT_REVIEW";     // presentar la organización a revisión

const CAPABILITIES: Record<OrganizationStatus, ReadonlySet<OrgCapability>> = {
  DRAFT: new Set(["WRITE", "SUBMIT_REVIEW"]),
  PENDING_REVIEW: new Set(["WRITE"]),
  APPROVED: new Set(["WRITE", "PUBLISH_EVENT", "OPEN_REGISTRATION", "INVITE_STAFF"]),
  REJECTED: new Set(["WRITE", "SUBMIT_REVIEW"]), // conserva motivo; permite corregir y volver a presentar
  SUSPENDED: new Set([]),                         // solo lectura; conserva todos los datos
  ARCHIVED: new Set([]),                          // solo lectura / histórico
};

export const orgCan = (status: OrganizationStatus, capability: OrgCapability) => CAPABILITIES[status].has(capability);

const DENIED: Record<OrgCapability, string> = {
  WRITE: "La parroquia está en solo lectura por su estado actual.",
  PUBLISH_EVENT: "La parroquia todavía no está aprobada: no se pueden publicar eventos.",
  OPEN_REGISTRATION: "La parroquia todavía no está aprobada: no se pueden abrir inscripciones.",
  INVITE_STAFF: "La parroquia no está aprobada: no se puede sumar personal.",
  SUBMIT_REVIEW: "La parroquia no puede presentarse a revisión en su estado actual.",
};

export function assertOrgCan(status: OrganizationStatus, capability: OrgCapability) {
  if (!orgCan(status, capability)) {
    throw new AppError(403, capability === "WRITE" ? "ORGANIZATION_READ_ONLY" : "ORGANIZATION_NOT_ALLOWED", `${DENIED[capability]} (estado: ${status})`);
  }
}

/** Estados de evento que equivalen a "publicado" (visible/operativo). */
export const PUBLISHED_EVENT_STATUSES = ["SCHEDULED", "IN_PROGRESS"] as const;
