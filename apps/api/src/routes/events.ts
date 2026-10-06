import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import {
  DEFAULT_EVENT_CAPABILITIES, createEventSchema, deriveRegistrationState, eventListQuerySchema, updateEventSchema, validateEventCoherence,
  type EventCapability, type EventStatus,
} from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { PUBLISHED_EVENT_STATUSES, assertOrgCan } from "../lib/orgLifecycle";
import { assertCapabilitiesRemovable, assertEventTransition, assertOwnDataRemovable, hasLocationData } from "../lib/eventLifecycle";
import { lockEvent } from "../lib/access";
import { Prisma } from "@prisma/client";
import { newOpaqueToken } from "../lib/tokens";

type EventRow = {
  id: string; registrationToken?: string | null; capabilities: EventCapability[]; registrationOpen: boolean; status: EventStatus;
  registrationOpensAt: Date | null; registrationClosesAt: Date | null; capacity: number | null;
};
/**
 * El enlace de inscripción es un secreto de gestión: nunca viaja en las respuestas de eventos.
 * A4: se agrega el estado DERIVADO de la inscripción (no se guarda), con el cupo contado sobre Participant ACTIVE.
 */
async function withState<T extends EventRow>(events: T[]) {
  const counts = events.length
    ? await prisma.participant.groupBy({ by: ["eventId"], where: { eventId: { in: events.map((e) => e.id) }, status: "ACTIVE" }, _count: { _all: true } })
    : [];
  const active = new Map(counts.map((c) => [c.eventId, c._count._all]));
  return events.map((e) => {
    const { registrationToken: _t, ...rest } = e;
    const activeParticipants = active.get(e.id) ?? 0;
    return { ...rest, activeParticipants, registrationState: deriveRegistrationState({ ...e, activeParticipants }) };
  });
}
const safe = async <T extends EventRow>(e: T) => (await withState([e]))[0];

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
    return { items: await withState(events) };
  });

  app.get("/:id", { preHandler: app.requirePermission("event:read") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const event = await prisma.event.findFirst({ where: { id, ...visibleWhere(req.auth) }, include });
    if (!event) throw notFound("Evento no encontrado.");
    return await safe(event);
  });

  app.post("/", { preHandler: app.requirePermission("event:create") }, async (req, reply) => {
    const { route, settings, capabilities: requested, ...body } = createEventSchema.parse(req.body);
    // A4: el tipo no decide los módulos; sin indicar, se usan las capacidades por defecto.
    const capabilities = requested ?? [...DEFAULT_EVENT_CAPABILITIES];
    assertCoherent({
      ...body, settings, hasRoute: !!route, capabilities, hasLocation: hasLocationData(body),
      registrationOpen: !!body.registrationOpen, certificateEnabled: !!body.certificateEnabled,
    });
    // A3: publicar y abrir inscripciones requieren organización aprobada.
    if ((PUBLISHED_EVENT_STATUSES as readonly string[]).includes(body.status)) assertOrgCan(req.auth.organizationStatus, "PUBLISH_EVENT");
    if (body.registrationOpen) assertOrgCan(req.auth.organizationStatus, "OPEN_REGISTRATION");
    const event = await prisma.event.create({
      data: {
        ...body,
        capabilities,
        organizationId: req.auth.organizationId,
        settings: (settings ?? {}) as Prisma.InputJsonObject,
        ...(body.registrationOpen ? { registrationToken: newOpaqueToken().raw } : {}),
        ...(route ? { route: { create: route } } : {}),
      },
      include,
    });
    await audit(req, { action: "EVENT_CREATED", entityType: "Event", entityId: event.id, eventId: event.id, metadata: { name: event.name, type: event.type } });
    return reply.status(201).send(await safe(event));
  });

  app.patch("/:id", { preHandler: app.requirePermission("event:update") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { route, settings, capabilities: requested, ...body } = updateEventSchema.parse(req.body);
    const before = await prisma.event.findFirst({ where: { id, organizationId: req.auth.organizationId }, include: { route: true } });
    if (!before) throw notFound("Evento no encontrado.");

    // A4: solo transiciones permitidas; el estado de la inscripción no interviene.
    if (body.status) assertEventTransition(before.status, body.status);
    const capabilities = requested ?? before.capabilities;
    const removed = before.capabilities.filter((c) => !capabilities.includes(c));
    // A4: una capacidad con datos propios guardados no se desactiva (409); nunca se borran en la misma edición.
    assertOwnDataRemovable(before, removed);
    const pick = <K extends keyof typeof body & keyof typeof before>(k: K) => (body[k] === undefined ? before[k] : body[k]);

    // Las reglas se validan sobre el resultado final: lo guardado + lo que llega.
    const finalHasRoute = route === undefined ? !!before.route : route !== null;
    assertCoherent({
      capabilities,
      hasLocation: hasLocationData({ locationName: pick("locationName"), address: pick("address"), latitude: pick("latitude"), longitude: pick("longitude") }),
      registrationOpen: !!pick("registrationOpen"),
      certificateEnabled: !!pick("certificateEnabled"),
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

    // A3: publicar y abrir inscripciones requieren organización aprobada.
    if (body.status && body.status !== before.status && (PUBLISHED_EVENT_STATUSES as readonly string[]).includes(body.status)) {
      assertOrgCan(req.auth.organizationStatus, "PUBLISH_EVENT");
    }
    if (body.registrationOpen && !before.registrationOpen) assertOrgCan(req.auth.organizationStatus, "OPEN_REGISTRATION");

    const data: Prisma.EventUpdateInput = { ...body };
    if (requested !== undefined) data.capabilities = capabilities;
    if (settings !== undefined) data.settings = settings as Prisma.InputJsonObject;
    if (body.registrationOpen && !before.registrationToken) data.registrationToken = newOpaqueToken().raw;
    if (route === null && before.route) data.route = { delete: true };
    if (route) data.route = { upsert: { create: route, update: route } };

    const event = await prisma.$transaction(async (tx) => {
      // Mismo bloqueo que el alta de participantes y la aprobación de inscripciones.
      await lockEvent(tx, id);
      // A4: desactivar una capacidad nunca borra datos; si el módulo los tiene, 409.
      await assertCapabilitiesRemovable(tx, id, removed);
      try {
        // Transición condicional: si otro cambio de estado se adelantó, no se pisa.
        return await tx.event.update({ where: { id, status: before.status }, data, include });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
          throw new AppError(409, "EVENT_STATUS_CHANGED", "El estado del evento cambió. Vuelve a cargarlo.");
        }
        throw e;
      }
    });
    const fields = [...Object.keys(body), ...(requested !== undefined ? ["capabilities"] : []), ...(settings !== undefined ? ["settings"] : []), ...(route !== undefined ? ["route"] : [])];
    const changes = Object.fromEntries(
      fields.map((k) => [k, { from: (before as Record<string, unknown>)[k] ?? null, to: (event as Record<string, unknown>)[k] ?? null }]),
    ) as Record<string, { from: unknown; to: unknown }>;
    await audit(req, {
      action: before.status !== event.status ? "EVENT_STATUS_CHANGED" : "EVENT_UPDATED",
      entityType: "Event", entityId: id, eventId: id, metadata: JSON.parse(JSON.stringify(changes)),
    });
    return await safe(event);
  });
  // No hay DELETE: los eventos nunca se borran, se marcan como CANCELLED para conservar el historial.
}
