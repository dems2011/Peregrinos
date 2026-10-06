import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { assignmentsSchema, createUserSchema, updateUserSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { hashPassword } from "../lib/password";
import { AppError, notFound } from "../lib/errors";
import { assertCanPromoteToSuperadmin, assertNotSuperadminGrant } from "../lib/roles";
import { assertOrgCan } from "../lib/orgLifecycle";

const idParam = z.object({ id: z.string().uuid() });
/** Solo cuentas del personal: las cuentas PILGRIM nunca se administran ni se asignan desde aquí. */
const staffOf = (organizationId: string) => ({ organizationId, accountType: "STAFF" as const });
const publicUser = { id: true, name: true, email: true, role: true, extraPermissions: true, isActive: true, createdAt: true, mfaEnabledAt: true } as const;

export default async function userRoutes(app: FastifyInstance) {
  /**
   * Debe quedar otro SUPERADMIN activo. Se comprueba dentro de la transacción y con un bloqueo por organización:
   * dos superadministradores que se desactivan o degradan mutuamente a la vez no pueden dejarla sin ninguno.
   */
  async function ensureAnotherSuperadmin(tx: Prisma.TransactionClient, orgId: string, excludeId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`superadmins:${orgId}`}))`;
    const others = await tx.user.count({ where: { ...staffOf(orgId), role: "SUPERADMIN", isActive: true, id: { not: excludeId } } });
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

  // A6 (§8.2): otorgar o quitar roles, cambiar claves y desactivar usuarios exigen un segundo factor reciente.
  const sensitive = [app.requirePermission("user:manage"), app.requireRecentMfa];

  app.post("/", { preHandler: sensitive }, async (req, reply) => {
    const body = createUserSchema.parse(req.body);
    assertNotSuperadminGrant(body.role, "USER_CREATE");
    assertOrgCan(req.auth.organizationStatus, "INVITE_STAFF");
    const user = await prisma.user.create({
      data: { organizationId: req.auth.organizationId, name: body.name, email: body.email, role: body.role, extraPermissions: body.extraPermissions, passwordHash: await hashPassword(body.password) },
      select: publicUser,
    });
    await audit(req, { action: "USER_CREATED", entityType: "User", entityId: user.id, metadata: { email: user.email, role: user.role } });
    return reply.status(201).send(user);
  });

  app.patch("/:id", { preHandler: sensitive }, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = updateUserSchema.parse(req.body);
    const target = await prisma.user.findFirst({ where: { id, ...staffOf(req.auth.organizationId) } });
    if (!target) throw notFound("Usuario no encontrado.");

    const gainsSuperadmin = body.role === "SUPERADMIN" && target.role !== "SUPERADMIN";
    if (gainsSuperadmin) assertCanPromoteToSuperadmin(req.auth, target);
    const losesSuperadmin =
      target.role === "SUPERADMIN" && target.isActive && (body.isActive === false || (body.role && body.role !== "SUPERADMIN"));
    const { password, ...rest } = body;
    const passwordHash = password ? await hashPassword(password) : null;
    // Si se desactiva o se cambia la contraseña, se cierran todas sus sesiones (refresh revocados y versión de sesión + 1).
    const closeSessions = body.isActive === false || !!password;
    const user = await prisma.$transaction(async (tx) => {
      if (losesSuperadmin) await ensureAnotherSuperadmin(tx, req.auth.organizationId, target.id);
      const u = await tx.user.update({
        where: { id },
        data: { ...rest, ...(passwordHash ? { passwordHash } : {}), ...(closeSessions ? { sessionVersion: { increment: 1 } } : {}) },
        select: publicUser,
      });
      if (closeSessions) {
        await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return u;
    });
    await audit(req, {
      action: "USER_UPDATED", entityType: "User", entityId: id,
      metadata: { fields: Object.keys(rest), passwordChanged: Boolean(password) },
    });
    if (body.role && body.role !== target.role) {
      await audit(req, {
        action: gainsSuperadmin ? "SUPERADMIN_GRANTED" : target.role === "SUPERADMIN" ? "SUPERADMIN_REVOKED" : "USER_ROLE_CHANGED",
        entityType: "User", entityId: id, metadata: { from: target.role, to: body.role },
      });
    }
    return user;
  });

  /**
   * A6: restablecer el MFA de otra cuenta del personal (perdió el teléfono y los códigos). La cuenta deberá enrolarse
   * de nuevo; sus sesiones se cierran. Solo un SUPERADMIN restablece a otro SUPERADMIN. Nunca la propia cuenta.
   */
  app.post("/:id/mfa/reset", { preHandler: sensitive, config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const target = await prisma.user.findFirst({ where: { id, ...staffOf(req.auth.organizationId) } });
    if (!target) throw notFound("Usuario no encontrado.");
    if (target.id === req.auth.id) throw new AppError(409, "SELF_MFA_RESET", "Usa la configuración de seguridad de tu cuenta.");
    if (target.role === "SUPERADMIN" && req.auth.role !== "SUPERADMIN") {
      throw new AppError(403, "FORBIDDEN", "Solo un superadministrador puede restablecer a otro superadministrador.");
    }
    if (!target.mfaEnabledAt && !target.mfaPendingSecret) throw new AppError(409, "MFA_NOT_ENABLED", "La cuenta no tiene verificación en dos pasos.");
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { mfaTotpSecret: null, mfaEnabledAt: null, mfaLastStep: null, mfaPendingSecret: null, mfaPendingAt: null, mfaFailedCount: 0, mfaLockedUntil: null, sessionVersion: { increment: 1 } },
      }),
      prisma.mfaRecoveryCode.deleteMany({ where: { userId: id } }),
      prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await audit(req, { action: "MFA_RESET_BY_ADMIN", entityType: "User", entityId: id, metadata: { email: target.email, targetRole: target.role } });
    return reply.status(204).send();
  });

  /** "Eliminar" = desactivar. El usuario queda en la BD para conservar la trazabilidad de sus registros. */
  app.delete("/:id", { preHandler: sensitive }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const target = await prisma.user.findFirst({ where: { id, ...staffOf(req.auth.organizationId) } });
    if (!target) throw notFound("Usuario no encontrado.");
    if (target.id === req.auth.id) throw new AppError(409, "SELF_DELETE", "No puedes desactivar tu propia cuenta.");
    await prisma.$transaction(async (tx) => {
      if (target.role === "SUPERADMIN" && target.isActive) await ensureAnotherSuperadmin(tx, req.auth.organizationId, target.id);
      await tx.user.update({ where: { id }, data: { isActive: false, sessionVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
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
