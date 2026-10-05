import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { createEventSchema, eventListQuerySchema, updateEventSchema, validateEventCoherence } from "@peregrinos/shared";
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

/** Las reglas entre campos se lanzan como ZodError: el cliente recibe el mismo formato de error (400 VALIDATION). */
function assertCoherent(input: Parameters<typeof validateEventCoherence>[0]) {
  const issues = validateEventCoherence(input);
  if (issues.length) {
    throw new ZodError(issues.map((i) => ({ code: "custom" as const, path: [i.field], message: i.message })));
  }
}

export default async function eventRoutes(app: FastifyInstance) {
  const include = {
    route: true,
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
    const { type, status } = eventListQuerySchema.parse(req.query);
    const events = await prisma.event.findMany({
      where: { ...visibleWhere(req.auth), ...(type ? { type } : {}), ...(status ? { status } : {}) },
      include,
      orderBy: { startsAt: "desc" },
    });
    return { items: events.map(safe) };
  });

  app.get("/:id", { preHandler: app.requirePermission("event:read") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const event = await prisma.event.findFirst({ where: { id, ...visibleWhere(req.auth) }, include });
    if (!event) throw notFound("Evento no encontrado.");
    return safe(event);
  });

  app.post("/", { preHandler: app.requirePermission("event:create") }, async (req, reply) => {
    const { route, settings, ...body } = createEventSchema.parse(req.body);
    assertCoherent({ ...body, settings, hasRoute: !!route });
    const event = await prisma.event.create({
      data: {
        ...body,
        organizationId: req.auth.organizationId,
        settings: (settings ?? {}) as Prisma.InputJsonObject,
        ...(body.registrationOpen ? { registrationToken: newOpaqueToken().raw } : {}),
        ...(route ? { route: { create: route } } : {}),
      },
      include,
    });
    await audit(req, { action: "EVENT_CREATED", entityType: "Event", entityId: event.id, eventId: event.id, metadata: { name: event.name, type: event.type } });
    return reply.status(201).send(safe(event));
  });

  app.patch("/:id", { preHandler: app.requirePermission("event:update") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { route, settings, ...body } = updateEventSchema.parse(req.body);
    const before = await prisma.event.findFirst({ where: { id, organizationId: req.auth.organizationId }, include: { route: true } });
    if (!before) throw notFound("Evento no encontrado.");

    // Las reglas se validan sobre el resultado final: lo guardado + lo que llega.
    const finalHasRoute = route === undefined ? !!before.route : route !== null;
    assertCoherent({
      type: body.type ?? before.type,
      startsAt: body.startsAt ?? before.startsAt,
      endsAt: body.endsAt === undefined ? before.endsAt : body.endsAt,
      registrationOpensAt: body.registrationOpensAt === undefined ? before.registrationOpensAt : body.registrationOpensAt,
      registrationClosesAt: body.registrationClosesAt === undefined ? before.registrationClosesAt : body.registrationClosesAt,
      latitude: body.latitude === undefined ? before.latitude : body.latitude,
      longitude: body.longitude === undefined ? before.longitude : body.longitude,
      settings: settings ?? before.settings,
      hasRoute: finalHasRoute,
    });

    const data: Prisma.EventUpdateInput = { ...body };
    if (settings !== undefined) data.settings = settings as Prisma.InputJsonObject;
    if (body.registrationOpen && !before.registrationToken) data.registrationToken = newOpaqueToken().raw;
    if (route === null && before.route) data.route = { delete: true };
    if (route) data.route = { upsert: { create: route, update: route } };

    const event = await prisma.event.update({ where: { id }, data, include });
    const fields = [...Object.keys(body), ...(settings !== undefined ? ["settings"] : []), ...(route !== undefined ? ["route"] : [])];
    const changes = Object.fromEntries(
      fields.map((k) => [k, { from: (before as Record<string, unknown>)[k] ?? null, to: (event as Record<string, unknown>)[k] ?? null }]),
    ) as Record<string, { from: unknown; to: unknown }>;
    await audit(req, {
      action: before.status !== event.status ? "EVENT_STATUS_CHANGED" : "EVENT_UPDATED",
      entityType: "Event", entityId: id, eventId: id, metadata: JSON.parse(JSON.stringify(changes)),
    });
    return safe(event);
  });
  // No hay DELETE: los eventos nunca se borran, se marcan como CANCELLED para conservar el historial.
}
