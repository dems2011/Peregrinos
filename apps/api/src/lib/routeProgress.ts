import type { PilgrimMe } from "@peregrinos/shared";
import { prisma } from "./prisma";

/**
 * Avance de un participante en el recorrido: puntos de control ACTIVOS del evento (en orden) y sus llegadas ACTIVAS
 * (las anuladas o en conflicto no cuentan). Solo lectura: no crea ni modifica registros. Es la misma regla para el
 * acceso personal (/api/pilgrim/me) y para la cuenta del peregrino (/api/auth/account/progress).
 */
export async function participantRoute(eventId: string, participantId: string): Promise<Pick<PilgrimMe, "route" | "progress">> {
  const [cps, mine] = await Promise.all([
    prisma.checkpoint.findMany({ where: { eventId, status: "ACTIVE" }, orderBy: { order: "asc" } }),
    prisma.checkin.findMany({ where: { eventId, participantId, status: "ACTIVE" } }),
  ]);
  const at = new Map(mine.map((c) => [c.checkpointId, c.timestamp]));
  const route = cps.map((c) => ({
    checkpointId: c.id, order: c.order, name: c.name, address: c.address, reference: c.reference,
    latitude: c.latitude, longitude: c.longitude, arrived: at.has(c.id), timestamp: at.get(c.id)?.toISOString() ?? null,
  }));
  const done = route.filter((r) => r.arrived).length;
  return { route, progress: { done, total: route.length, percent: route.length ? Math.round((done / route.length) * 100) : 0 } };
}

/** Contactos del evento que ve el participante (emergencias primero). Mismo listado en el acceso personal y en la cuenta. */
export async function eventContacts(eventId: string): Promise<PilgrimMe["contacts"]> {
  const rows = await prisma.eventContact.findMany({
    where: { eventId }, orderBy: [{ isEmergency: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { checkpoint: { select: { name: true } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, roleLabel: c.roleLabel, phone: c.phone, email: c.email, notes: c.notes, isEmergency: c.isEmergency, checkpointName: c.checkpoint?.name ?? null }));
}
