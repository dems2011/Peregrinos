import type { FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  eventId?: string | null;
  metadata?: Prisma.InputJsonValue;
  userId?: string | null;
  organizationId?: string | null;
}

export async function audit(req: FastifyRequest, input: AuditInput) {
  await auditTx(prisma, req, input);
}

/**
 * Igual que audit(), pero dentro de la transacción de la operación: si la operación se confirma, su auditoría
 * también (A4a: fusiones y vinculaciones de Person nunca quedan sin registro).
 */
export async function auditTx(tx: Pick<Prisma.TransactionClient, "auditLog">, req: FastifyRequest, input: AuditInput) {
  await tx.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      eventId: input.eventId ?? null,
      metadata: input.metadata,
      userId: input.userId ?? req.auth?.id ?? null,
      organizationId: input.organizationId ?? req.auth?.organizationId ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
    },
  });
}
