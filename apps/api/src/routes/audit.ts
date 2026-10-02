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
        include: { user: { select: { id: true, name: true, role: true } } },
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items };
  });
}
