import {
  EVENT_CAPABILITY_LABEL, EVENT_STATUS_LABEL, canTransitionEvent, hasEventCapability,
  type EventCapability, type EventStatus, type ImplementedEventCapability,
} from "@peregrinos/shared";
import type { Prisma } from "@prisma/client";
import { AppError } from "./errors";

/**
 * A4 — Ciclo de vida del evento y capacidades. Las tablas viven en packages/shared (EVENT_TRANSITIONS,
 * EVENT_CAPABILITY_REQUIRES); aquí se aplican en el servidor. El estado de la inscripción nunca cambia el del evento.
 */
export function assertEventTransition(from: EventStatus, to: EventStatus) {
  if (from === to) return;
  if (!canTransitionEvent(from, to)) {
    throw new AppError(409, "INVALID_EVENT_TRANSITION", `No se puede pasar de «${EVENT_STATUS_LABEL[from]}» a «${EVENT_STATUS_LABEL[to]}».`);
  }
}

/** Un módulo solo se modifica si el evento tiene activa su capacidad. */
export function assertEventCapability(event: { capabilities: readonly string[] }, capability: EventCapability) {
  if (!hasEventCapability(event, capability)) {
    throw new AppError(403, "EVENT_CAPABILITY_DISABLED", `El evento no tiene activado «${EVENT_CAPABILITY_LABEL[capability]}».`);
  }
}

type Tx = Prisma.TransactionClient;
/**
 * Datos que dependen de cada capacidad y viven en otras tablas. Exhaustivo sobre las capacidades implementadas:
 * al pasar VOLUNTEERS/COMMUNICATIONS/DOCUMENTS a implementadas (A5), TypeScript obliga a declarar aquí su conteo.
 * null = sus datos viven en el propio evento (assertOwnDataRemovable y los CHECK de la BD) o no tiene datos (INFO).
 */
const DATA: Record<ImplementedEventCapability, ((tx: Tx, eventId: string) => Promise<number>) | null> = {
  INFO: null,
  LOCATION: null,
  ROUTE: null,
  CERTIFICATES: null,
  REGISTRATION: (tx, eventId) => tx.registration.count({ where: { eventId } }),
  PARTICIPANTS: (tx, eventId) => tx.participant.count({ where: { eventId } }),
  CHECKIN: (tx, eventId) => tx.checkin.count({ where: { eventId } }),
  POINTS: (tx, eventId) => tx.checkpoint.count({ where: { eventId } }),
  CONTACTS: (tx, eventId) => tx.eventContact.count({ where: { eventId } }),
  // A5.1: voluntarios y su organización (equipos, zonas, funciones, turnos) son datos del módulo.
  VOLUNTEERS: async (tx, eventId) => {
    const n = await Promise.all([
      tx.volunteerParticipation.count({ where: { eventId } }), tx.team.count({ where: { eventId } }), tx.zone.count({ where: { eventId } }),
      tx.dutyFunction.count({ where: { eventId } }), tx.shift.count({ where: { eventId } }),
    ]);
    return n.reduce((a, b) => a + b, 0);
  },
};

/**
 * A4: cupo. Todo camino que suma participantes ACTIVE (aprobar inscripción, alta manual, importación, reactivar un
 * CANCELLED) lo comprueba con el evento BLOQUEADO (lockEvent), así dos operaciones simultáneas se serializan y
 * nunca superan capacity. Solo cuentan los participantes ACTIVE; las inscripciones pendientes no consumen cupo.
 */
export async function assertCapacityFor(tx: Tx, eventId: string, adding: number) {
  if (adding <= 0) return;
  const { capacity } = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { capacity: true } });
  if (capacity == null) return;
  const active = await tx.participant.count({ where: { eventId, status: "ACTIVE" } });
  if (active + adding > capacity) {
    throw new AppError(409, "EVENT_FULL", adding === 1
      ? "El cupo del evento está completo."
      : `El cupo del evento no alcanza: quedan ${Math.max(0, capacity - active)} lugares y se intentan sumar ${adding}.`);
  }
}

export const hasLocationData = (e: { locationName?: string | null; address?: string | null; latitude?: number | null; longitude?: number | null }) =>
  e.locationName != null || e.address != null || e.latitude != null || e.longitude != null;

/**
 * Datos guardados en el propio evento (lugar, trayecto, certificado): si existen, la capacidad no se desactiva (409).
 * Para desactivarla hay que quitarlos antes en una edición explícita; nunca se borran como efecto de apagarla.
 */
export function assertOwnDataRemovable(
  before: { locationName: string | null; address: string | null; latitude: number | null; longitude: number | null; route: unknown; certificateEnabled: boolean; certificatePhrase: string | null },
  removed: readonly EventCapability[],
) {
  const withData: string[] = [];
  if (removed.includes("LOCATION") && hasLocationData(before)) withData.push(EVENT_CAPABILITY_LABEL.LOCATION);
  if (removed.includes("ROUTE") && before.route) withData.push(EVENT_CAPABILITY_LABEL.ROUTE);
  if (removed.includes("CERTIFICATES") && (before.certificateEnabled || before.certificatePhrase != null)) withData.push(EVENT_CAPABILITY_LABEL.CERTIFICATES);
  if (withData.length) {
    throw new AppError(409, "CAPABILITY_HAS_DATA", `No se puede desactivar porque ya tiene datos: ${withData.join(", ")}. Quítalos primero; los datos nunca se borran al desactivar.`);
  }
}

/** Desactivar una capacidad nunca borra datos: si el módulo ya tiene datos, se rechaza (409). */
export async function assertCapabilitiesRemovable(tx: Tx, eventId: string, removed: readonly EventCapability[]) {
  const withData: string[] = [];
  for (const c of removed) {
    // Una reservada nunca está activa (CHECK de la BD); si llegara, no tiene datos que contar.
    const count = (DATA as Partial<Record<EventCapability, ((tx: Tx, eventId: string) => Promise<number>) | null>>)[c];
    if (count && (await count(tx, eventId)) > 0) withData.push(EVENT_CAPABILITY_LABEL[c]);
  }
  if (withData.length) {
    throw new AppError(409, "CAPABILITY_HAS_DATA", `No se puede desactivar porque ya tiene datos: ${withData.join(", ")}. Los datos nunca se borran.`);
  }
}
