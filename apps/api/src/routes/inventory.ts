import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { inventoryItemSchema, inventoryQuerySchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { notFound } from "../lib/errors";

const idParam = z.object({ id: z.string().uuid() });
const day = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00.000Z`) : null);
const data = (b: z.infer<typeof inventoryItemSchema>) => ({
  name: b.name, category: b.category, description: b.description ?? null, location: b.location ?? null, condition: b.condition ?? "GOOD",
  quantity: b.quantity ?? 1, acquiredAt: day(b.acquiredAt), responsible: b.responsible ?? null, notes: b.notes ?? null,
});

/**
 * B5 — Inventario parroquial (prefijo /api/organization/inventory). Permiso inventory:manage. Registro de bienes, no
 * contabilidad. Dar de baja = archivar (se conserva el registro).
 */
export default async function inventoryRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("inventory:manage");

  app.get("/", { preHandler: manage }, async (req) => {
    const q = inventoryQuerySchema.parse(req.query);
    const items = await prisma.inventoryItem.findMany({
      where: {
        organizationId: req.auth.organizationId,
        archivedAt: q.archived === "true" ? { not: null } : null,
        ...(q.category ? { category: q.category } : {}),
        ...(q.condition ? { condition: q.condition } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }, { location: { contains: q.q, mode: "insensitive" } }, { responsible: { contains: q.q, mode: "insensitive" } }] } : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 500,
    });
    return { items };
  });

  app.post("/", { preHandler: manage }, async (req, reply) => {
    const b = inventoryItemSchema.parse(req.body);
    const item = await prisma.inventoryItem.create({ data: { organizationId: req.auth.organizationId, ...data(b), createdById: req.auth.id } });
    await audit(req, { action: "INVENTORY_ITEM_CREATED", entityType: "InventoryItem", entityId: item.id });
    return reply.status(201).send(item);
  });

  app.put("/:id", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = inventoryItemSchema.parse(req.body);
    const r = await prisma.inventoryItem.updateMany({ where: { id, organizationId: req.auth.organizationId }, data: data(b) });
    if (r.count !== 1) throw notFound("Bien no encontrado.");
    await audit(req, { action: "INVENTORY_ITEM_UPDATED", entityType: "InventoryItem", entityId: id });
    return prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
  });

  /** Dar de baja (archivar) o reincorporar; nunca se borra. */
  app.post("/:id/archive", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { archived } = z.object({ archived: z.boolean() }).strict().parse(req.body);
    const r = await prisma.inventoryItem.updateMany({ where: { id, organizationId: req.auth.organizationId }, data: { archivedAt: archived ? new Date() : null } });
    if (r.count !== 1) throw notFound("Bien no encontrado.");
    await audit(req, { action: archived ? "INVENTORY_ITEM_ARCHIVED" : "INVENTORY_ITEM_RESTORED", entityType: "InventoryItem", entityId: id });
    return prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
  });
}
