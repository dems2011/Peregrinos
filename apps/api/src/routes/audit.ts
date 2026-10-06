import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { paginationSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";

const filters = paginationSchema.extend({
  eventId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  entityType: z.string().max(50).optional(),
  action: z.string().max(60).optional(),
});

/**
 * El historial de la organización solo identifica a su personal. Las acciones de una cuenta PILGRIM (p. ej. rechazar
 * una solicitud de voluntariado o canjear un código) o de PLATFORM quedan registradas, pero sin exponer su nombre ni
 * su id de cuenta a la organización (la cuenta personal no es un dato de la organización).
 */
export function auditItemView<T extends { userId: string | null; user: { id: string; name: string; role: string | null; accountType: string } | null }>(item: T) {
  const { user, ...rest } = item;
  if (!user) return { ...rest, user: null, actorType: null };
  if (user.accountType !== "STAFF") return { ...rest, userId: null, user: null, actorType: user.accountType };
  return { ...rest, user: { id: user.id, name: user.name, role: user.role }, actorType: "STAFF" };
}

export default async function auditRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requirePermission("audit:read") }, async (req) => {
    const q = filters.parse(req.query);
    const where = {
      organizationId: req.auth.organizationId,
      ...(q.eventId && { eventId: q.eventId }),
      ...(q.userId && { userId: q.userId }),
      ...(q.entityType && { entityType: q.entityType }),
      ...(q.action && { action: q.action }),
    };
    const [total, items] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: { user: { select: { id: true, name: true, role: true, accountType: true } } },
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items: items.map(auditItemView) };
  });
}
