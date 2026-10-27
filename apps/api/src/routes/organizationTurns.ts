import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { turnDecisionSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { auditTx } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { lockCursor } from "../lib/integrationLimits";

const idParam = z.object({ id: z.string().uuid() });

/**
 * Turnos que SIGyP pide decidir al sacerdote (prefijo /api/organization/turns), permiso turn:decide. Una sola decisión
 * por versión del turno: la actualización es condicional (PENDIENTE y misma versión que vio quien decide) y la tabla de
 * decisiones tiene clave única (turno, versión). La decisión vuelve a SIGyP cuando SIGyP la consulta (cursor).
 */
export default async function organizationTurnRoutes(app: FastifyInstance) {
  const decide = app.requirePermission("turn:decide");

  app.get("/", { preHandler: decide }, async (req) => {
    const org = req.auth.organizationId;
    const select = { id: true, version: true, title: true, category: true, startsAt: true, endsAt: true, location: true, note: true, status: true, decidedAt: true, reason: true, pushStatus: true, receivedAt: true } as const;
    const [pending, recent, agenda] = await Promise.all([
      prisma.pastoralTurn.findMany({ where: { organizationId: org, status: "PENDING" }, orderBy: { startsAt: "asc" }, take: 200, select }),
      prisma.pastoralTurn.findMany({ where: { organizationId: org, status: { in: ["ACCEPTED", "REJECTED", "WITHDRAWN"] } }, orderBy: { updatedAt: "desc" }, take: 30, select }),
      // Agenda del sacerdote: lo ya aceptado que todavía no terminó, en orden.
      prisma.pastoralTurn.findMany({ where: { organizationId: org, status: "ACCEPTED", endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 100, select }),
    ]);
    return { pending, recent, agenda };
  });

  /** Cantidad pendiente (para el indicador del menú). */
  app.get("/summary", { preHandler: decide }, async (req) => ({
    pending: await prisma.pastoralTurn.count({ where: { organizationId: req.auth.organizationId, status: "PENDING" } }),
  }));

  app.post("/:id/decision", { preHandler: decide, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = turnDecisionSchema.parse(req.body);
    const reason = b.decision === "REJECTED" ? b.reason! : (b.reason ?? null);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.id }, select: { name: true } });
    try {
      return await prisma.$transaction(async (tx) => {
        // Decisiones de una misma organización en fila: el `seq` (cursor de SIGyP) se asigna y se confirma en orden. Sin
        // esto, dos decisiones simultáneas podían hacerse visibles en orden inverso y SIGyP saltarse la de `seq` menor.
        await lockCursor(tx, "pastoral-turn-decision", req.auth.organizationId);
        const now = new Date();
        const r = await tx.pastoralTurn.updateMany({
          where: { id, organizationId: req.auth.organizationId, status: "PENDING", version: b.version },
          data: { status: b.decision, decidedVersion: b.version, decidedById: req.auth.id, decidedAt: now, reason },
        });
        if (r.count !== 1) {
          const t = await tx.pastoralTurn.findFirst({ where: { id, organizationId: req.auth.organizationId }, select: { status: true, version: true } });
          if (!t) throw notFound("Turno no encontrado.");
          if (t.version !== b.version) throw new AppError(409, "TURN_CHANGED", "El turno cambió en SIGyP: revisa la versión nueva antes de decidir.");
          throw new AppError(409, "TURN_ALREADY_DECIDED", t.status === "WITHDRAWN" ? "Este turno ya no requiere decisión." : "Este turno ya tiene una decisión.");
        }
        const d = await tx.pastoralTurnDecision.create({
          data: { organizationId: req.auth.organizationId, turnId: id, sourceId: (await tx.pastoralTurn.findUniqueOrThrow({ where: { id }, select: { sourceId: true } })).sourceId, version: b.version, decision: b.decision, reason, decidedById: req.auth.id, decidedByName: user.name, decidedAt: now },
          select: { seq: true },
        });
        await auditTx(tx, req, { action: b.decision === "ACCEPTED" ? "TURN_ACCEPTED" : "TURN_REJECTED", entityType: "PastoralTurn", entityId: id, metadata: { version: b.version, seq: d.seq, ...(reason ? { reason } : {}) } });
        return { status: b.decision, version: b.version, seq: d.seq };
      });
    } catch (e) {
      // Dos decisiones simultáneas de la misma versión: la clave única deja pasar una sola.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "TURN_ALREADY_DECIDED", "Este turno ya tiene una decisión.");
      throw e;
    }
  });
}
