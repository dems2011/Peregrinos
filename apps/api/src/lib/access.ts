import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./prisma";
import type { EventCapability } from "@peregrinos/shared";
import { forbidden, notFound } from "./errors";
import { assertEventCapability } from "./eventLifecycle";

export const eventParam = z.object({ eventId: z.string().uuid() });

/** Devuelve el evento solo si es de la organización del usuario (y, si es operador, si tiene un punto asignado). */
export async function loadEvent(req: FastifyRequest, eventId: string) {
  const a = req.auth;
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      organizationId: a.organizationId,
      ...(a.role === "OPERATOR" ? { assignments: { some: { userId: a.id } } } : {}),
    },
  });
  if (!event) throw notFound("Evento no encontrado.");
  return event;
}

/** A4: igual que loadEvent, y además exige que el evento tenga activa la capacidad del módulo. */
export async function loadEventWith(req: FastifyRequest, eventId: string, capability: EventCapability) {
  const event = await loadEvent(req, eventId);
  assertEventCapability(event, capability);
  return event;
}

/** Un operador solo puede registrar llegadas en los puntos que tiene asignados. */
export async function assertCanUseCheckpoint(req: FastifyRequest, checkpointId: string) {
  if (req.auth.role !== "OPERATOR") return;
  const ok = await prisma.operatorAssignment.findFirst({ where: { userId: req.auth.id, checkpointId } });
  if (!ok) throw forbidden("Este punto de control no está asignado a tu usuario.");
}

/**
 * Bloqueo por evento para asignar números/orden sin carreras entre peticiones simultáneas.
 * $executeRaw y no $queryRaw: pg_advisory_xact_lock devuelve `void`, que Prisma no puede deserializar.
 */
export async function lockEvent(tx: { $executeRaw: typeof prisma.$executeRaw }, eventId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
}

export function assertEventOpen(status: string) {
  if (status === "DRAFT") {
    throw forbidden("El evento está en borrador: todavía no se pueden registrar llegadas.");
  }
  if (status === "FINISHED" || status === "CANCELLED") {
    throw forbidden("El evento está finalizado o cancelado: ya no se pueden registrar llegadas.");
  }
}
