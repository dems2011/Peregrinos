import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PILGRIM_REQUEST_OPEN, pilgrimRequestCreateSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { auditTx } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { lockCursor } from "../lib/integrationLimits";

const orgQuery = z.object({ organizationId: z.string().uuid() });
/** Solicitudes abiertas por persona y parroquia: un tope contra el abuso, no contra el uso normal. */
export const MAX_OPEN_REQUESTS = 5;

/**
 * Solicitudes de la cuenta del peregrino a una parroquia (prefijo /api/auth/account/requests, 2026-10-27). Solo se
 * pueden pedir los tipos que la parroquia habilitó desde SIGyP y solo mientras su vinculación con SIGyP permita las
 * solicitudes (si no, nadie las recibiría). Cada persona ve solo las suyas. El estado lo publica SIGyP.
 */
export default async function pilgrimRequestRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticatePilgrimAccount };

  /** Organizaciones que hoy reciben solicitudes: aprobadas y con una credencial de SIGyP vigente con requests:sync. */
  const receiving = (organizationId: string) => prisma.integrationClient.findFirst({
    where: { organizationId, kind: "SIGYP", revokedAt: null, scopes: { has: "requests:sync" }, organization: { status: "APPROVED" } }, select: { id: true },
  });

  app.get("/types", auth, async (req) => {
    const { organizationId } = orgQuery.parse(req.query);
    if (!(await receiving(organizationId))) return { accepting: false, items: [] };
    const items = await prisma.parishRequestType.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, description: true } });
    return { accepting: items.length > 0, items };
  });

  app.get("/", auth, async (req) => {
    const items = await prisma.pilgrimRequest.findMany({
      where: { userId: req.pilgrimAccount.id }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, typeName: true, description: true, status: true, number: true, message: true, createdAt: true, updatedAt: true, organization: { select: { id: true, name: true } } },
    });
    return { items };
  });

  app.post("/", { preHandler: app.authenticatePilgrimAccount, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const b = pilgrimRequestCreateSchema.parse(req.body);
    const userId = req.pilgrimAccount.id;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, emailVerifiedAt: true } });
    if (!user.emailVerifiedAt) throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verifica tu correo antes de enviar solicitudes.");
    if (!(await receiving(b.organizationId))) throw new AppError(409, "REQUESTS_NOT_ACCEPTED", "Esta parroquia no recibe solicitudes en línea por ahora.");
    const out = await prisma.$transaction(async (tx) => {
      const type = await tx.parishRequestType.findFirst({ where: { id: b.typeId, organizationId: b.organizationId, active: true }, select: { id: true, name: true } });
      if (!type) throw notFound("Ese trámite no está disponible en la parroquia.");
      // En fila por parroquia: el `seq` que lee SIGyP se confirma en orden (ver lockCursor).
      await lockCursor(tx, "pilgrim-request", b.organizationId);
      const open = await tx.pilgrimRequest.count({ where: { userId, organizationId: b.organizationId, status: { in: [...PILGRIM_REQUEST_OPEN] } } });
      if (open >= MAX_OPEN_REQUESTS) throw new AppError(409, "TOO_MANY_OPEN_REQUESTS", `Tienes ${open} solicitudes abiertas en esta parroquia: espera a que respondan alguna.`);
      const created = await tx.pilgrimRequest.create({
        data: { organizationId: b.organizationId, userId, typeId: type.id, typeName: type.name, requesterName: user.name, requesterEmail: user.email, requesterPhone: b.phone || null, description: b.description },
        select: { id: true, status: true, createdAt: true },
      });
      // La auditoría no guarda la descripción (puede tener datos sacramentales): solo qué y para quién.
      await auditTx(tx, req, { action: "PILGRIM_REQUEST_CREATED", entityType: "PilgrimRequest", entityId: created.id, organizationId: b.organizationId, userId, metadata: { typeId: type.id } });
      return created;
    });
    return reply.status(201).send(out);
  });
}
