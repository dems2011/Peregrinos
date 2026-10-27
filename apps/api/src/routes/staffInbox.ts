import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { deviceBody, deviceRevokeBody } from "./accountSocial";

const idParam = z.object({ id: z.string().uuid() });

/**
 * Bandeja de avisos y teléfono para push del PERSONAL (prefijo /api/staff), igual que los de la cuenta del peregrino
 * (/api/auth/account). Hasta 2026-10-27 el personal no tenía ninguna de las dos: los avisos dirigidos al personal (de la
 * parroquia, de SIGyP, turnos para el sacerdote) quedaban guardados sin que nadie del personal los viera.
 */
export default async function staffInboxRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };
  const limited = (max: number) => ({ preHandler: app.authenticate, config: { rateLimit: { max, timeWindow: "1 minute" } } });

  app.get("/notifications", auth, async (req) => {
    const userId = req.auth.id;
    const [rows, unread] = await Promise.all([
      prisma.notificationRecipient.findMany({
        where: { userId }, orderBy: { createdAt: "desc" }, take: 100,
        select: { readAt: true, notification: { select: { id: true, kind: true, title: true, body: true, createdAt: true, urgent: true } } },
      }),
      prisma.notificationRecipient.count({ where: { userId, readAt: null } }),
    ]);
    return { unread, items: rows.map((r) => ({ ...r.notification, readAt: r.readAt })) };
  });

  app.post("/notifications/:id/read", auth, async (req) => {
    const { id } = idParam.parse(req.params);
    await prisma.notificationRecipient.updateMany({ where: { notificationId: id, userId: req.auth.id, readAt: null }, data: { readAt: new Date() } });
    return { read: true };
  });

  app.post("/notifications/read-all", auth, async (req) => {
    const r = await prisma.notificationRecipient.updateMany({ where: { userId: req.auth.id, readAt: null }, data: { readAt: new Date() } });
    return { read: r.count };
  });

  /** Registra o renueva el token FCM del teléfono de esta cuenta (mismo criterio que la cuenta del peregrino). */
  app.post("/devices", limited(30), async (req, reply) => {
    const { token, platform } = deviceBody.parse(req.body);
    const userId = req.auth.id;
    const prev = await prisma.deviceToken.findUnique({ where: { token }, select: { userId: true } });
    const device = await prisma.deviceToken.upsert({
      where: { token }, create: { userId, token, platform }, update: { userId, platform, lastSeenAt: new Date(), revokedAt: null },
      select: { id: true, platform: true, lastSeenAt: true },
    });
    if (!prev || prev.userId !== userId) {
      await audit(req, { action: "DEVICE_REGISTERED", entityType: "DeviceToken", entityId: device.id, metadata: { platform, reassigned: !!prev, accountType: "STAFF" } });
    }
    return reply.status(prev ? 200 : 201).send({ registered: true, device });
  });

  app.delete("/devices", limited(30), async (req) => {
    const { token } = deviceRevokeBody.parse(req.body);
    const r = await prisma.deviceToken.updateMany({ where: { token, userId: req.auth.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { revoked: r.count > 0 };
  });
}
