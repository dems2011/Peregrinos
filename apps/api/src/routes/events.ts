import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createEventSchema, updateEventSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { notFound } from "../lib/errors";
import type { Prisma } from "@prisma/client";
import { newOpaqueToken } from "../lib/tokens";

/** El enlace de inscripción es un secreto de gestión: nunca viaja en las respuestas de eventos. */
const safe = <T extends { registrationToken?: string | null }>(e: T) => {
  const { registrationToken: _t, ...rest } = e;
  return rest;
};

const idParam = z.object({ id: z.string().uuid() });

export default async function eventRoutes(app: FastifyInstance) {
  const include = {
    _count: {
      select: {
        participants: true,
        checkpoints: true,
        checkins: { where: { status: "ACTIVE" as const } },
      },
    },
  };

  /** Los operadores solo ven los eventos donde tienen un punto asignado. Todo se filtra por organización. */
  const visibleWhere = (a: { id: string; role: string; organizationId: string }) => ({
    organizationId: a.organizationId,
    ...(a.role === "OPERATOR" ? { assignments: { some: { userId: a.id } } } : {}),
  });

  app.get("/", { preHandler: app.requirePermission("event:read") }, async (req) => {
    const events = await prisma.event.findMany({ where: visibleWhere(req.auth), include, orderBy: { startsAt: "desc" } });
    return { items: events.map(safe) };
  });

  app.get("/:id", { preHandler: app.requirePermission("event:read") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const event = await prisma.event.findFirst({ where: { id, ...visibleWhere(req.auth) }, include });
    if (!event) throw notFound("Evento no encontrado.");
    return safe(event);
  });

  app.post("/", { preHandler: app.requirePermission("event:create") }, async (req, reply) => {
    const body = createEventSchema.parse(req.body);
    const event = await prisma.event.create({ data: { ...body, organizationId: req.auth.organizationId } });
    await audit(req, { action: "EVENT_CREATED", entityType: "Event", entityId: event.id, eventId: event.id, metadata: { name: event.name } });
    return reply.status(201).send(safe(event));
  });

  app.patch("/:id", { preHandler: app.requirePermission("event:update") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = updateEventSchema.parse(req.body);
    const before = await prisma.event.findFirst({ where: { id, organizationId: req.auth.organizationId } });
    if (!before) throw notFound("Evento no encontrado.");
    const data: Prisma.EventUpdateInput = { ...body };
    if (body.registrationOpen && !before.registrationToken) data.registrationToken = newOpaqueToken().raw;
    const event = await prisma.event.update({ where: { id }, data });
    const changes = Object.fromEntries(
      Object.keys(body).map((k) => [k, { from: (before as Record<string, unknown>)[k] ?? null, to: (event as Record<string, unknown>)[k] ?? null }]),
    ) as Record<string, { from: unknown; to: unknown }>;
    await audit(req, {
      action: before.status !== event.status ? "EVENT_STATUS_CHANGED" : "EVENT_UPDATED",
      entityType: "Event", entityId: id, eventId: id, metadata: JSON.parse(JSON.stringify(changes)),
    });
    return safe(event);
  });
  // No hay DELETE: los eventos nunca se borran, se marcan como CANCELLED para conservar el historial.
}
