import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./prisma";
import { forbidden, notFound } from "./errors";

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

/** Un operador solo puede registrar llegadas en los puntos que tiene asignados. */
export async function assertCanUseCheckpoint(req: FastifyRequest, checkpointId: string) {
  if (req.auth.role !== "OPERATOR") return;
  const ok = await prisma.operatorAssignment.findFirst({ where: { userId: req.auth.id, checkpointId } });
  if (!ok) throw forbidden("Este punto de control no está asignado a tu usuario.");
}

/** Bloqueo por evento para asignar números/orden sin carreras entre peticiones simultáneas. */
export async function lockEvent(tx: { $queryRaw: typeof prisma.$queryRaw }, eventId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
}

export function assertEventOpen(status: string) {
  if (status === "DRAFT") {
    throw forbidden("El evento está en borrador: todavía no se pueden registrar llegadas.");
  }
  if (status === "FINISHED" || status === "CANCELLED") {
    throw forbidden("El evento está finalizado o cancelado: ya no se pueden registrar llegadas.");
  }
}
