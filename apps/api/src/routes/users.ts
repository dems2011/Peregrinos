import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assignmentsSchema, createUserSchema, updateUserSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { hashPassword } from "../lib/password";
import { AppError, notFound } from "../lib/errors";

const idParam = z.object({ id: z.string().uuid() });
/** Solo cuentas del personal: las cuentas PILGRIM nunca se administran ni se asignan desde aquí. */
const staffOf = (organizationId: string) => ({ organizationId, accountType: "STAFF" as const });
const publicUser = { id: true, name: true, email: true, role: true, extraPermissions: true, isActive: true, createdAt: true } as const;

export default async function userRoutes(app: FastifyInstance) {
  async function ensureAnotherSuperadmin(orgId: string, excludeId: string) {
    const others = await prisma.user.count({ where: { ...staffOf(orgId), role: "SUPERADMIN", isActive: true, id: { not: excludeId } } });
    if (others === 0) throw new AppError(409, "LAST_SUPERADMIN", "Debe quedar al menos un superadministrador activo.");
  }

  app.get("/", { preHandler: app.requirePermission("user:manage") }, async (req) => {
    const items = await prisma.user.findMany({
      where: staffOf(req.auth.organizationId),
      select: publicUser,
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    return { items };
  });

  app.post("/", { preHandler: app.requirePermission("user:manage") }, async (req, reply) => {
    const body = createUserSchema.parse(req.body);
    const user = await prisma.user.create({
      data: { organizationId: req.auth.organizationId, name: body.name, email: body.email, role: body.role, extraPermissions: body.extraPermissions, passwordHash: await hashPassword(body.password) },
      select: publicUser,
    });
    await audit(req, { action: "USER_CREATED", entityType: "User", entityId: user.id, metadata: { email: user.email, role: user.role } });
    return reply.status(201).send(user);
  });

  app.patch("/:id", { preHandler: app.requirePermission("user:manage") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = updateUserSchema.parse(req.body);
    const target = await prisma.user.findFirst({ where: { id, ...staffOf(req.auth.organizationId) } });
    if (!target) throw notFound("Usuario no encontrado.");

    const losesSuperadmin =
      target.role === "SUPERADMIN" && target.isActive && (body.isActive === false || (body.role && body.role !== "SUPERADMIN"));
    if (losesSuperadmin) await ensureAnotherSuperadmin(target.organizationId, target.id);

    const { password, ...rest } = body;
    const user = await prisma.user.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
      select: publicUser,
    });
    // Si se desactiva o se cambia la contraseña, se cierran todas sus sesiones.
    if (body.isActive === false || password) {
      await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(req, {
      action: "USER_UPDATED", entityType: "User", entityId: id,
      metadata: { fields: Object.keys(rest), passwordChanged: Boolean(password) },
    });
    return user;
  });

  /** "Eliminar" = desactivar. El usuario queda en la BD para conservar la trazabilidad de sus registros. */
  app.delete("/:id", { preHandler: app.requirePermission("user:manage") }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const target = await prisma.user.findFirst({ where: { id, ...staffOf(req.auth.organizationId) } });
    if (!target) throw notFound("Usuario no encontrado.");
    if (target.id === req.auth.id) throw new AppError(409, "SELF_DELETE", "No puedes desactivar tu propia cuenta.");
    if (target.role === "SUPERADMIN" && target.isActive) await ensureAnotherSuperadmin(target.organizationId, target.id);
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req, { action: "USER_DEACTIVATED", entityType: "User", entityId: id, metadata: { email: target.email } });
    return reply.status(204).send();
  });

  /* ---- Asignación de operadores a puntos de control ---- */
  app.get("/:id/assignments", { preHandler: app.requirePermission("assignment:manage") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const rows = await prisma.operatorAssignment.findMany({
      where: { userId: id, user: staffOf(req.auth.organizationId) },
      include: { checkpoint: { include: { event: { select: { id: true, name: true } } } } },
    });
    return {
      items: rows.map((r) => ({
        checkpointId: r.checkpointId, checkpointName: r.checkpoint.name, order: r.checkpoint.order,
        eventId: r.eventId, eventName: r.checkpoint.event.name,
      })),
    };
  });

  /** Reemplaza todas las asignaciones del usuario por la lista enviada (puede abarcar varios puntos). */
  app.put("/:id/assignments", { preHandler: app.requirePermission("assignment:manage") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { checkpointIds } = assignmentsSchema.parse(req.body);
    const user = await prisma.user.findFirst({ where: { id, ...staffOf(req.auth.organizationId) } });
    if (!user) throw notFound("Usuario no encontrado.");
    if (user.role !== "OPERATOR") throw new AppError(400, "NOT_OPERATOR", "Solo los operadores tienen puntos asignados.");

    const unique = [...new Set(checkpointIds)];
    const checkpoints = await prisma.checkpoint.findMany({
      where: { id: { in: unique }, event: { organizationId: req.auth.organizationId } },
      select: { id: true, eventId: true },
    });
    if (checkpoints.length !== unique.length) throw new AppError(400, "INVALID_CHECKPOINT", "Algún punto de control no existe.");

    await prisma.$transaction([
      prisma.operatorAssignment.deleteMany({ where: { userId: id } }),
      prisma.operatorAssignment.createMany({ data: checkpoints.map((c) => ({ userId: id, checkpointId: c.id, eventId: c.eventId })) }),
    ]);
    await audit(req, { action: "OPERATOR_ASSIGNMENT_CHANGED", entityType: "User", entityId: id, metadata: { checkpointIds: unique } });
    return { userId: id, checkpointIds: unique };
  });
}
