import { Prisma } from "@prisma/client";
import { LEGACY_FORMAT_LOCALE, formatTime, resolveTimeZone, type CheckinMethod } from "@peregrinos/shared";
import { prisma } from "./prisma";
import { AppError, notFound } from "./errors";

export interface RegisterInput {
  id?: string;
  eventId: string;
  participantId: string;
  checkpointId: string;
  operatorId: string;
  method: CheckinMethod;
  timestamp: Date;
  latitude?: number;
  longitude?: number;
  deviceId?: string;
}

export type RegisterResult =
  | { result: "CREATED" | "IDEMPOTENT"; checkinId: string }
  | { result: "CONFLICT"; checkinId: string; conflictOfId: string };

/** Hora "HH:mm" en la zona del evento (cae a DEFAULT_TIMEZONE); idioma de formato heredado hasta que el pedido traiga el del usuario. */
const fmt = (d: Date, zone?: string | null) => formatTime(d, { locale: LEGACY_FORMAT_LOCALE, timeZone: resolveTimeZone(zone) });

/**
 * Núcleo del registro de llegadas.
 *  - mode "online": si ya existe una llegada ACTIVA de esa persona en ese punto, responde 409 y NO crea nada.
 *  - mode "sync":   (Fase 4) el registro ya ocurrió en terreno, así que se conserva como CONFLICT enlazado al original.
 * Es idempotente por `id`: reenviar el mismo UUID no duplica nada.
 */
export async function registerCheckin(input: RegisterInput, mode: "online" | "sync"): Promise<RegisterResult> {
  if (input.id) {
    const prev = await prisma.checkin.findUnique({ where: { id: input.id } });
    if (prev) {
      if (prev.eventId !== input.eventId) throw new AppError(409, "ID_IN_USE", "Ese identificador ya fue usado.");
      return { result: "IDEMPOTENT", checkinId: prev.id };
    }
  }

  const [participant, checkpoint] = await Promise.all([
    prisma.participant.findFirst({ where: { id: input.participantId, eventId: input.eventId } }),
    prisma.checkpoint.findFirst({ where: { id: input.checkpointId, eventId: input.eventId } }),
  ]);
  if (!participant) throw notFound("La persona no pertenece a este evento.");
  if (!checkpoint) throw notFound("El punto de control no pertenece a este evento.");
  if (participant.status !== "ACTIVE") throw new AppError(409, "PARTICIPANT_NOT_ACTIVE", "Esta persona está inactiva o cancelada.");
  if (checkpoint.status !== "ACTIVE") throw new AppError(409, "CHECKPOINT_INACTIVE", "Este punto de control está desactivado.");

  const findActive = () =>
    prisma.checkin.findFirst({
      where: { eventId: input.eventId, participantId: input.participantId, checkpointId: input.checkpointId, status: "ACTIVE" },
      include: { operator: { select: { name: true } }, event: { select: { timezone: true } } },
    });

  const alreadyError = (c: NonNullable<Awaited<ReturnType<typeof findActive>>>) =>
    new AppError(409, "ALREADY_CHECKED_IN", "Esta persona ya registró su llegada en este punto.", {
      checkinId: c.id, timestamp: c.timestamp, operator: c.operator.name, checkpoint: checkpoint.name, time: fmt(c.timestamp, c.event.timezone),
    });

  const base = {
    id: input.id, eventId: input.eventId, participantId: input.participantId, checkpointId: input.checkpointId,
    operatorId: input.operatorId, timestamp: input.timestamp, method: input.method,
    latitude: input.latitude, longitude: input.longitude, deviceId: input.deviceId,
  };

  const existing = await findActive();
  if (existing) {
    if (mode === "online") throw alreadyError(existing);
    const c = await prisma.checkin.create({ data: { ...base, status: "CONFLICT", conflictOfId: existing.id } });
    return { result: "CONFLICT", checkinId: c.id, conflictOfId: existing.id };
  }

  try {
    const c = await prisma.checkin.create({ data: { ...base, status: "ACTIVE" } });
    return { result: "CREATED", checkinId: c.id };
  } catch (e) {
    // Carrera: otra petición insertó la llegada ACTIVA justo antes (el índice parcial lo impide).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const winner = await findActive();
      if (winner) {
        if (mode === "online") throw alreadyError(winner);
        const c = await prisma.checkin.create({ data: { ...base, status: "CONFLICT", conflictOfId: winner.id } });
        return { result: "CONFLICT", checkinId: c.id, conflictOfId: winner.id };
      }
    }
    throw e;
  }
}
