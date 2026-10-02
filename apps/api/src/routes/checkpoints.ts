import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createCheckpointSchema, reorderCheckpointsSchema, updateCheckpointSchema } from "@peregrinos/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { eventParam, loadEvent, lockEvent } from "../lib/access";

const idParam = eventParam.extend({ id: z.string().uuid() });

/** Reasigna `order` = 1..n en el orden dado, evitando choques con el índice único (eventId, order). */
async function applyOrder(tx: Prisma.TransactionClient, eventId: string, ids: string[]) {
  await tx.$executeRaw`UPDATE "Checkpoint" SET "order" = "order" + 100000 WHERE "eventId" = ${eventId}`;
  for (let i = 0; i < ids.length; i++) await tx.checkpoint.update({ where: { id: ids[i] }, data: { order: i + 1 } });
}

export default async function checkpointRoutes(app: FastifyInstance) {
  /** Lista con avance: llegadas activas / capacidad. Los operadores solo ven los puntos de su evento. */
  app.get("/", { preHandler: app.requirePermission("checkpoint:read") }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const [cps, counts] = await Promise.all([
      prisma.checkpoint.findMany({ where: { eventId }, orderBy: { order: "asc" } }),
      prisma.checkin.groupBy({ by: ["checkpointId"], where: { eventId, status: "ACTIVE" }, _count: { _all: true } }),
    ]);
    const byCp = new Map(counts.map((c) => [c.checkpointId, c._count._all]));
    return {
      items: cps.map((c) => {
        const arrivals = byCp.get(c.id) ?? 0;
        return { ...c, arrivals, percent: c.capacity ? Math.min(100, Math.round((arrivals / c.capacity) * 100)) : null };
      }),
    };
  });

  app.post("/", { preHandler: app.requirePermission("checkpoint:manage") }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const body = createCheckpointSchema.parse(req.body);
    const cp = await prisma.$transaction(async (tx) => {
      await lockEvent(tx, eventId);
      const max = await tx.checkpoint.aggregate({ where: { eventId }, _max: { order: true } });
      return tx.checkpoint.create({ data: { ...body, eventId, order: (max._max.order ?? 0) + 1 } });
    });
    await audit(req, { action: "CHECKPOINT_CREATED", entityType: "Checkpoint", entityId: cp.id, eventId, metadata: { name: cp.name, order: cp.order } });
    return reply.status(201).send(cp);
  });

  app.patch("/:id", { preHandler: app.requirePermission("checkpoint:manage") }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEvent(req, eventId);
    const body = updateCheckpointSchema.parse(req.body);
    const before = await prisma.checkpoint.findFirst({ where: { id, eventId } });
    if (!before) throw notFound("Punto de control no encontrado.");
    const cp = await prisma.checkpoint.update({ where: { id }, data: body });
    await audit(req, {
      action: before.status !== cp.status ? (cp.status === "ACTIVE" ? "CHECKPOINT_ACTIVATED" : "CHECKPOINT_DEACTIVATED") : "CHECKPOINT_UPDATED",
      entityType: "Checkpoint", entityId: id, eventId, metadata: { fields: Object.keys(body) },
    });
    return cp;
  });

  /** Cambia el orden del recorrido. Debe enviarse la lista completa de puntos del evento. */
  app.put("/order", { preHandler: app.requirePermission("checkpoint:manage") }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const { checkpointIds } = reorderCheckpointsSchema.parse(req.body);
    const current = await prisma.checkpoint.findMany({ where: { eventId }, select: { id: true } });
    const same = current.length === checkpointIds.length && new Set(checkpointIds).size === current.length &&
      current.every((c) => checkpointIds.includes(c.id));
    if (!same) throw new AppError(400, "INVALID_ORDER", "La lista debe incluir todos los puntos del evento, una sola vez cada uno.");
    await prisma.$transaction(async (tx) => { await lockEvent(tx, eventId); await applyOrder(tx, eventId, checkpointIds); });
    await audit(req, { action: "CHECKPOINTS_REORDERED", entityType: "Event", entityId: eventId, eventId, metadata: { checkpointIds } });
    return { checkpointIds };
  });

  /** Solo se pueden eliminar puntos sin llegadas; si tienen historial, hay que desactivarlos. */
  app.delete("/:id", { preHandler: app.requirePermission("checkpoint:manage") }, async (req, reply) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEvent(req, eventId);
    const cp = await prisma.checkpoint.findFirst({ where: { id, eventId } });
    if (!cp) throw notFound("Punto de control no encontrado.");
    if ((await prisma.checkin.count({ where: { checkpointId: id } })) > 0) {
      throw new AppError(409, "HAS_CHECKINS", "Este punto ya tiene llegadas registradas. Desactívalo en lugar de eliminarlo.");
    }
    await prisma.$transaction(async (tx) => {
      await lockEvent(tx, eventId);
      await tx.operatorAssignment.deleteMany({ where: { checkpointId: id } });
      await tx.incident.updateMany({ where: { checkpointId: id }, data: { checkpointId: null } });
      await tx.checkpoint.delete({ where: { id } });
      const rest = await tx.checkpoint.findMany({ where: { eventId }, orderBy: { order: "asc" }, select: { id: true } });
      await applyOrder(tx, eventId, rest.map((r) => r.id));
    });
    await audit(req, { action: "CHECKPOINT_DELETED", entityType: "Checkpoint", entityId: id, eventId, metadata: { name: cp.name } });
    return reply.status(204).send();
  });
}
