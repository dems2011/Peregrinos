import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isValidTimeZone, organizationTimezoneSchema, scheduleItemSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";

const idParam = z.object({ id: z.string().uuid() });
const toDate = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00.000Z`) : null);

/**
 * B5 — Agenda pastoral y litúrgica (prefijo /api/organization/agenda). Permiso agenda:manage. Actividades habituales
 * (misas, confesiones, adoración, catequesis…) — distintas de los eventos especiales y peregrinaciones (Event).
 */
export default async function agendaRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("agenda:manage");

  app.get("/", { preHandler: manage }, async (req) => {
    const [items, org] = await Promise.all([
      prisma.scheduleItem.findMany({ where: { organizationId: req.auth.organizationId }, orderBy: [{ active: "desc" }, { weekday: "asc" }, { date: "asc" }, { startTime: "asc" }] }),
      prisma.organization.findUniqueOrThrow({ where: { id: req.auth.organizationId }, select: { timezone: true } }),
    ]);
    return { timezone: org.timezone, items };
  });

  app.post("/", { preHandler: manage }, async (req, reply) => {
    const b = scheduleItemSchema.parse(req.body);
    const item = await prisma.scheduleItem.create({
      data: { organizationId: req.auth.organizationId, kind: b.kind, title: b.title, weekday: b.weekday ?? null, date: toDate(b.date), startTime: b.startTime, endTime: b.endTime ?? null, location: b.location ?? null, notes: b.notes ?? null, active: b.active ?? true },
    });
    await audit(req, { action: "AGENDA_ITEM_CREATED", entityType: "ScheduleItem", entityId: item.id, metadata: { kind: item.kind } });
    return reply.status(201).send(item);
  });

  app.put("/:id", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = scheduleItemSchema.parse(req.body);
    const r = await prisma.scheduleItem.updateMany({
      where: { id, organizationId: req.auth.organizationId },
      data: { kind: b.kind, title: b.title, weekday: b.weekday ?? null, date: toDate(b.date), startTime: b.startTime, endTime: b.endTime ?? null, location: b.location ?? null, notes: b.notes ?? null, active: b.active ?? true },
    });
    if (r.count !== 1) throw notFound("Actividad no encontrada.");
    await audit(req, { action: "AGENDA_ITEM_UPDATED", entityType: "ScheduleItem", entityId: id });
    return prisma.scheduleItem.findUniqueOrThrow({ where: { id } });
  });

  app.delete("/:id", { preHandler: manage }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const r = await prisma.scheduleItem.deleteMany({ where: { id, organizationId: req.auth.organizationId } });
    if (r.count !== 1) throw notFound("Actividad no encontrada.");
    await audit(req, { action: "AGENDA_ITEM_DELETED", entityType: "ScheduleItem", entityId: id });
    return reply.status(204).send();
  });

  /** Zona horaria de la agenda (por defecto la de Argentina). */
  app.put("/timezone", { preHandler: manage }, async (req) => {
    const { timezone } = organizationTimezoneSchema.parse(req.body);
    if (!isValidTimeZone(timezone)) throw new AppError(400, "INVALID_TIMEZONE", "Zona horaria no válida.");
    await prisma.organization.update({ where: { id: req.auth.organizationId }, data: { timezone } });
    await audit(req, { action: "ORGANIZATION_TIMEZONE_CHANGED", entityType: "Organization", entityId: req.auth.organizationId, metadata: { timezone } });
    return { timezone };
  });
}
