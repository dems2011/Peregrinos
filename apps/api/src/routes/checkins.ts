import type { FastifyInstance } from "fastify";
import { publish } from "../lib/bus";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  cancelCheckinSchema, checkinListSchema, correctCheckinSchema, createCheckinSchema, resolveConflictSchema,
} from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { assertCanUseCheckpoint, assertEventOpen, eventParam, loadEvent } from "../lib/access";
import { registerCheckin } from "../lib/checkins";

const idParam = eventParam.extend({ id: z.string().uuid() });
const include = {
  participant: { select: { number: true, firstName: true, lastName: true, documentNumber: true } },
  checkpoint: { select: { name: true, order: true } },
  operator: { select: { id: true, name: true } },
} as const;

export default async function checkinRoutes(app: FastifyInstance) {
  /** Registrar llegada. El resultado trae todo lo que necesita la pantalla verde de confirmación. */
  app.post("/", { preHandler: app.requirePermission("checkin:create") }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    const event = await loadEvent(req, eventId);
    assertEventOpen(event.status);
    const body = createCheckinSchema.parse(req.body);
    await assertCanUseCheckpoint(req, body.checkpointId);

    // El servidor no acepta horas del futuro (relojes mal configurados): se usa la hora del servidor.
    const now = new Date();
    const timestamp = body.timestamp && body.timestamp.getTime() <= now.getTime() + 5 * 60_000 ? body.timestamp : now;

    const r = await registerCheckin({ ...body, eventId, operatorId: req.auth.id, timestamp }, "online");
    const checkin = await prisma.checkin.findUniqueOrThrow({ where: { id: r.checkinId }, include });
    if (r.result === "CREATED") {
      await audit(req, {
        action: "CHECKIN_REGISTERED", entityType: "Checkin", entityId: checkin.id, eventId,
        metadata: { participant: checkin.participant.number, checkpoint: checkin.checkpoint.name, method: checkin.method },
      });
      publish(eventId, {
        type: "checkin.created",
        data: {
          checkinId: checkin.id, participantId: checkin.participantId, checkpointId: checkin.checkpointId, number: checkin.participant.number,
          firstName: checkin.participant.firstName, lastName: checkin.participant.lastName, checkpointName: checkin.checkpoint.name,
          timestamp: checkin.timestamp.toISOString(), operator: checkin.operator.name,
        },
      });
    }
    return reply.status(r.result === "CREATED" ? 201 : 200).send({ result: r.result, checkin });
  });

  /** Historial con filtros: fecha/hora (from/to), punto, persona, operador, método, estado. */
  app.get("/", { preHandler: app.requirePermission("checkin:read") }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const q = checkinListSchema.parse(req.query);
    const where: Prisma.CheckinWhereInput = {
      eventId,
      ...(q.checkpointId && { checkpointId: q.checkpointId }),
      ...(q.participantId && { participantId: q.participantId }),
      ...(q.operatorId && { operatorId: q.operatorId }),
      ...(q.method && { method: q.method }),
      ...(q.status && { status: q.status }),
      ...((q.from || q.to) && { timestamp: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } }),
    };
    const [total, items] = await prisma.$transaction([
      prisma.checkin.count({ where }),
      prisma.checkin.findMany({ where, include, orderBy: { timestamp: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items };
  });

  /** Últimas llegadas y total, para el panel de inicio. */
  app.get("/recent", { preHandler: app.requirePermission("checkin:read") }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const where = { eventId, status: "ACTIVE" as const };
    const [total, items] = await Promise.all([
      prisma.checkin.count({ where }),
      prisma.checkin.findMany({ where, include, orderBy: { timestamp: "desc" }, take: 10 }),
    ]);
    return { total, items };
  });

  /** Registros marcados como CONFLICT (duplicados detectados al sincronizar), con su original. */
  app.get("/conflicts", { preHandler: app.requirePermission("checkin:correct") }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const conflicts = await prisma.checkin.findMany({ where: { eventId, status: "CONFLICT" }, include, orderBy: { timestamp: "asc" } });
    const originals = await prisma.checkin.findMany({ where: { id: { in: conflicts.flatMap((c) => (c.conflictOfId ? [c.conflictOfId] : [])) } }, include });
    const byId = new Map(originals.map((o) => [o.id, o]));
    return { items: conflicts.map((c) => ({ conflict: c, original: c.conflictOfId ? byId.get(c.conflictOfId) ?? null : null })) };
  });

  /** Anular un registro (nunca se borra): queda CANCELLED con motivo, quién y cuándo. */
  app.post("/:id/cancel", { preHandler: app.requirePermission("checkin:correct") }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEvent(req, eventId);
    const { reason } = cancelCheckinSchema.parse(req.body);
    const c = await prisma.checkin.findFirst({ where: { id, eventId }, include });
    if (!c) throw notFound("Registro no encontrado.");
    if (c.status === "CANCELLED") throw new AppError(409, "ALREADY_CANCELLED", "Este registro ya estaba anulado.");
    const updated = await prisma.checkin.update({
      where: { id }, data: { status: "CANCELLED", cancelReason: reason, cancelledById: req.auth.id, cancelledAt: new Date() }, include,
    });
    await audit(req, { action: "CHECKIN_CANCELLED", entityType: "Checkin", entityId: id, eventId, metadata: { reason, participant: c.participant.number, checkpoint: c.checkpoint.name, previousStatus: c.status } });
    publish(eventId, { type: "checkin.updated", data: { checkinId: id } });
    return updated;
  });

  /** Corregir hora y/o punto de un registro activo. Exige motivo y deja el antes/después en la auditoría. */
  app.patch("/:id", { preHandler: app.requirePermission("checkin:correct") }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEvent(req, eventId);
    const body = correctCheckinSchema.parse(req.body);
    const c = await prisma.checkin.findFirst({ where: { id, eventId }, include });
    if (!c) throw notFound("Registro no encontrado.");
    if (c.status !== "ACTIVE") throw new AppError(409, "NOT_ACTIVE", "Solo se pueden corregir registros activos.");
    if (body.checkpointId) {
      const cp = await prisma.checkpoint.findFirst({ where: { id: body.checkpointId, eventId } });
      if (!cp) throw notFound("El punto de control no pertenece a este evento.");
    }
    try {
      const updated = await prisma.checkin.update({
        where: { id }, data: { ...(body.timestamp && { timestamp: body.timestamp }), ...(body.checkpointId && { checkpointId: body.checkpointId }) }, include,
      });
      await audit(req, {
        action: "CHECKIN_CORRECTED", entityType: "Checkin", entityId: id, eventId,
        metadata: { reason: body.reason, before: { timestamp: c.timestamp.toISOString(), checkpointId: c.checkpointId }, after: { timestamp: updated.timestamp.toISOString(), checkpointId: updated.checkpointId } },
      });
      publish(eventId, { type: "checkin.updated", data: { checkinId: id } });
      return updated;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppError(409, "ALREADY_CHECKED_IN", "Esa persona ya tiene una llegada activa en el punto elegido.");
      }
      throw e;
    }
  });

  /**
   * Resolver un conflicto offline:
   *  KEEP_ORIGINAL → el original sigue activo; este registro queda CANCELLED.
   *  USE_THIS      → este registro pasa a ACTIVE; el original queda CANCELLED.
   * Ninguno se borra y todo queda en la auditoría.
   */
  app.post("/:id/resolve", { preHandler: app.requirePermission("checkin:correct") }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEvent(req, eventId);
    const { action, reason } = resolveConflictSchema.parse(req.body);
    const c = await prisma.checkin.findFirst({ where: { id, eventId } });
    if (!c || c.status !== "CONFLICT") throw notFound("No hay un conflicto pendiente con ese identificador.");
    const now = new Date();
    const note = reason?.trim() || (action === "KEEP_ORIGINAL" ? "Conflicto resuelto: se conserva el registro original" : "Conflicto resuelto: se reemplaza el registro original");

    await prisma.$transaction(async (tx) => {
      if (action === "KEEP_ORIGINAL") {
        await tx.checkin.update({ where: { id }, data: { status: "CANCELLED", cancelReason: note, cancelledById: req.auth.id, cancelledAt: now } });
      } else {
        if (c.conflictOfId) {
          await tx.checkin.update({ where: { id: c.conflictOfId }, data: { status: "CANCELLED", cancelReason: note, cancelledById: req.auth.id, cancelledAt: now } });
        }
        await tx.checkin.update({ where: { id }, data: { status: "ACTIVE", conflictOfId: null } });
      }
    });
    await audit(req, { action: "CHECKIN_CONFLICT_RESOLVED", entityType: "Checkin", entityId: id, eventId, metadata: { action, originalId: c.conflictOfId, note } });
    publish(eventId, { type: "checkin.updated", data: { checkinId: id } });
    return { ok: true };
  });
}
