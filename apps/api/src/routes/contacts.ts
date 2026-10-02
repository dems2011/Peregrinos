import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createContactSchema, updateContactSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { eventParam, loadEvent } from "../lib/access";

const idParam = eventParam.extend({ id: z.string().uuid() });

/** Contactos de la organización que el peregrino ve en su pestaña "Contactos". */
export default async function contactRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("contact:manage");

  async function assertCheckpoint(eventId: string, checkpointId?: string | null) {
    if (!checkpointId) return;
    if (!(await prisma.checkpoint.findFirst({ where: { id: checkpointId, eventId } }))) {
      throw new AppError(400, "INVALID_CHECKPOINT", "El punto de control no pertenece a este evento.");
    }
  }

  app.get("/", { preHandler: app.requirePermission("event:read") }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const items = await prisma.eventContact.findMany({
      where: { eventId }, orderBy: [{ isEmergency: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { checkpoint: { select: { name: true } } },
    });
    return { items };
  });

  app.post("/", { preHandler: manage }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const body = createContactSchema.parse(req.body);
    await assertCheckpoint(eventId, body.checkpointId);
    const c = await prisma.eventContact.create({ data: { ...body, eventId } });
    await audit(req, { action: "CONTACT_CREATED", entityType: "EventContact", entityId: c.id, eventId, metadata: { name: c.name } });
    return reply.status(201).send(c);
  });

  app.patch("/:id", { preHandler: manage }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEvent(req, eventId);
    const body = updateContactSchema.parse(req.body);
    if (!(await prisma.eventContact.findFirst({ where: { id, eventId } }))) throw notFound("Contacto no encontrado.");
    await assertCheckpoint(eventId, body.checkpointId);
    const c = await prisma.eventContact.update({ where: { id }, data: body });
    await audit(req, { action: "CONTACT_UPDATED", entityType: "EventContact", entityId: id, eventId, metadata: { fields: Object.keys(body) } });
    return c;
  });

  app.delete("/:id", { preHandler: manage }, async (req, reply) => {
    const { eventId, id } = idParam.parse(req.params);
    await loadEvent(req, eventId);
    const c = await prisma.eventContact.findFirst({ where: { id, eventId } });
    if (!c) throw notFound("Contacto no encontrado.");
    await prisma.eventContact.delete({ where: { id } });
    await audit(req, { action: "CONTACT_DELETED", entityType: "EventContact", entityId: id, eventId, metadata: { name: c.name } });
    return reply.status(204).send();
  });
}
