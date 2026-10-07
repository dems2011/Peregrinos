import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import QRCode from "qrcode";
import { qrContent } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, forbidden, notFound } from "../lib/errors";
import { assertPilgrimInEvent, listMessages, postMessage } from "../lib/chat";
import { parishMediaUrls } from "./public";

/**
 * B1 — Lo social de la cuenta del peregrino (prefijo /api/auth/account): seguir parroquias, bandeja de avisos, sus
 * dispositivos para push, sus eventos con el chat de cada uno y el QR de su credencial. Todo limitado a la propia
 * cuenta y a su Person.
 */
const orgParam = z.object({ organizationId: z.string().uuid() });
const eventParamSchema = z.object({ eventId: z.string().uuid() });
const idParam = z.object({ id: z.string().uuid() });
/** Token FCM: texto opaco de Firebase (letras, dígitos, ":", "_" y "-"); se valida el formato, no el contenido. */
const fcmToken = z.string().trim().min(20, "Token de dispositivo inválido.").max(4096).regex(/^[A-Za-z0-9_:-]+$/, "Token de dispositivo inválido.");
const deviceBody = z.object({ token: fcmToken, platform: z.enum(["ANDROID"]).default("ANDROID") }).strict();
/** Baja: el token va en el cuerpo, nunca en la URL (las URL quedan en los logs). */
const deviceRevokeBody = z.object({ token: fcmToken }).strict();

async function personOf(req: FastifyRequest) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.pilgrimAccount.id }, select: { personId: true } });
  if (!u.personId) throw forbidden("La cuenta no tiene una persona asociada.");
  return u.personId;
}

export default async function accountSocialRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticatePilgrimAccount };
  const limited = (max: number) => ({ preHandler: app.authenticatePilgrimAccount, config: { rateLimit: { max, timeWindow: "1 minute" } } });

  /* ---------- Seguir parroquias ---------- */
  app.get("/follows", auth, async (req) => {
    const rows = await prisma.parishFollower.findMany({
      where: { userId: req.pilgrimAccount.id, organization: { status: "APPROVED" } },
      select: { createdAt: true, organization: { select: { id: true, name: true, address: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { items: await Promise.all(rows.map(async (r) => ({ ...r.organization, since: r.createdAt, ...(await parishMediaUrls(r.organization.id)) }))) };
  });

  app.post("/follows", limited(30), async (req, reply) => {
    const { organizationId } = orgParam.parse(req.body);
    const org = await prisma.organization.findFirst({ where: { id: organizationId, status: "APPROVED" }, select: { id: true } });
    if (!org) throw notFound("Parroquia no encontrada.");
    await prisma.parishFollower.upsert({
      where: { organizationId_userId: { organizationId, userId: req.pilgrimAccount.id } },
      create: { organizationId, userId: req.pilgrimAccount.id }, update: {},
    });
    await audit(req, { action: "PARISH_FOLLOWED", entityType: "Organization", entityId: organizationId, userId: req.pilgrimAccount.id, organizationId });
    return reply.status(201).send({ following: true });
  });

  app.delete("/follows/:organizationId", limited(30), async (req) => {
    const { organizationId } = orgParam.parse(req.params);
    await prisma.parishFollower.deleteMany({ where: { organizationId, userId: req.pilgrimAccount.id } });
    await audit(req, { action: "PARISH_UNFOLLOWED", entityType: "Organization", entityId: organizationId, userId: req.pilgrimAccount.id, organizationId });
    return { following: false };
  });

  /* ---------- Avisos ---------- */
  app.get("/notifications", auth, async (req) => {
    const userId = req.pilgrimAccount.id;
    const [rows, unread] = await Promise.all([
      prisma.notificationRecipient.findMany({
        where: { userId }, orderBy: { createdAt: "desc" }, take: 100,
        select: {
          readAt: true, createdAt: true,
          notification: { select: { id: true, kind: true, title: true, body: true, createdAt: true, organization: { select: { id: true, name: true } }, event: { select: { id: true, name: true } } } },
        },
      }),
      prisma.notificationRecipient.count({ where: { userId, readAt: null } }),
    ]);
    return { unread, items: rows.map((r) => ({ ...r.notification, readAt: r.readAt })) };
  });

  app.post("/notifications/:id/read", auth, async (req) => {
    const { id } = idParam.parse(req.params);
    await prisma.notificationRecipient.updateMany({ where: { notificationId: id, userId: req.pilgrimAccount.id, readAt: null }, data: { readAt: new Date() } });
    return { read: true };
  });

  app.post("/notifications/read-all", auth, async (req) => {
    const r = await prisma.notificationRecipient.updateMany({ where: { userId: req.pilgrimAccount.id, readAt: null }, data: { readAt: new Date() } });
    return { read: r.count };
  });

  /* ---------- Dispositivos para notificaciones push (tokens FCM) ---------- */
  /**
   * Registra o renueva el token del dispositivo. El token es único: si ya existía (otra cuenta en el mismo teléfono,
   * o dado de baja), pasa a esta cuenta y vuelve a estar activo. La respuesta nunca incluye el token.
   */
  app.post("/devices", limited(30), async (req, reply) => {
    const { token, platform } = deviceBody.parse(req.body);
    const userId = req.pilgrimAccount.id;
    const prev = await prisma.deviceToken.findUnique({ where: { token }, select: { userId: true } });
    const device = await prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date(), revokedAt: null },
      select: { id: true, platform: true, lastSeenAt: true },
    });
    // Se audita el alta y el cambio de cuenta (no cada renovación al abrir la app). Nunca se guarda el token.
    if (!prev || prev.userId !== userId) {
      await audit(req, { action: "DEVICE_REGISTERED", entityType: "DeviceToken", entityId: device.id, userId, metadata: { platform, reassigned: !!prev } });
    }
    return reply.status(prev ? 200 : 201).send({ registered: true, device });
  });

  /** Da de baja el token (p. ej. al cerrar sesión). Solo el de esta cuenta; no se borra, queda con revokedAt. */
  app.delete("/devices", limited(30), async (req) => {
    const { token } = deviceRevokeBody.parse(req.body);
    const r = await prisma.deviceToken.updateMany({ where: { token, userId: req.pilgrimAccount.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { revoked: r.count > 0 };
  });

  /* ---------- Mis eventos (participación, inscripción o voluntariado) ---------- */
  app.get("/events", auth, async (req) => {
    const personId = await personOf(req);
    const eventSel = { select: { id: true, name: true, status: true, startsAt: true, timezone: true, parishName: true, organization: { select: { id: true, name: true } } } } as const;
    const [parts, regs, vols] = await Promise.all([
      prisma.participant.findMany({ where: { personId }, select: { id: true, number: true, status: true, event: eventSel } }),
      prisma.registration.findMany({ where: { personId }, select: { id: true, status: true, participantId: true, event: eventSel } }),
      prisma.volunteerParticipation.findMany({ where: { personId }, select: { id: true, status: true, event: eventSel } }),
    ]);
    const map = new Map<string, Record<string, unknown>>();
    const base = (e: (typeof parts)[number]["event"]) => ({
      id: e.id, name: e.name, status: e.status, startsAt: e.startsAt, timezone: e.timezone,
      organization: { id: e.organization.id, name: e.parishName ?? e.organization.name },
    });
    for (const r of regs) map.set(r.event.id, { ...base(r.event), registration: { id: r.id, status: r.status } });
    for (const p of parts) map.set(p.event.id, { ...(map.get(p.event.id) ?? base(p.event)), participant: { id: p.id, number: p.number, status: p.status } });
    for (const v of vols) map.set(v.event.id, { ...(map.get(v.event.id) ?? base(v.event)), volunteer: { id: v.id, status: v.status } });
    const items = [...map.values()].map((e) => {
      const p = e.participant as { status: string } | undefined, r = e.registration as { status: string } | undefined, v = e.volunteer as { status: string } | undefined;
      const chat = p?.status === "ACTIVE" || (!!r && !["CANCELLED", "REJECTED"].includes(r.status)) || v?.status === "APPROVED";
      return { ...e, chat } as Record<string, unknown> & { startsAt: Date; chat: boolean };
    }).sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return { items };
  });

  /* ---------- Chat del evento (como peregrino) ---------- */
  app.get("/events/:eventId/chat", auth, async (req) => {
    const { eventId } = eventParamSchema.parse(req.params);
    const personId = await personOf(req);
    await assertPilgrimInEvent(personId, eventId);
    return listMessages(eventId, { kind: "PILGRIM", personId }, req.query);
  });

  app.post("/events/:eventId/chat", limited(20), async (req, reply) => {
    const { eventId } = eventParamSchema.parse(req.params);
    const personId = await personOf(req);
    await assertPilgrimInEvent(personId, eventId);
    return reply.status(201).send(await postMessage(eventId, { kind: "PILGRIM", personId }, req.body));
  });

  /* ---------- Credencial: QR de una participación propia ---------- */
  app.get("/participations/:id/qr.svg", auth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const personId = await personOf(req);
    const p = await prisma.participant.findFirst({ where: { id, personId }, select: { qrToken: true, status: true } });
    if (!p) throw notFound("Participación no encontrada.");
    if (p.status !== "ACTIVE") throw new AppError(409, "PARTICIPATION_CANCELLED", "Esta participación fue cancelada.");
    reply.header("Content-Type", "image/svg+xml");
    reply.header("Cache-Control", "private, no-store");
    return reply.send(await QRCode.toString(qrContent(p.qrToken), { type: "svg", margin: 2, errorCorrectionLevel: "M" }));
  });
}
