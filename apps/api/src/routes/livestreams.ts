import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { createLivestreamSchema, updateLivestreamSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { assertOrgCan } from "../lib/orgLifecycle";
import { notifyFollowers, pushNotification } from "../lib/notifications";
import { parseYouTubeVideoId } from "../lib/youtube";
import { livestreamView, refreshVerified } from "../lib/livestreams";

const idParam = z.object({ id: z.string().uuid() });

/**
 * B5 — Transmisiones de YouTube de la parroquia (prefijo /api/organization/livestreams). Permiso stream:manage; todo
 * acotado a la organización de la sesión. El video y su chat viven en YouTube: aquí solo se guarda el id del video.
 */
export default async function livestreamRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("stream:manage");

  async function own(req: FastifyRequest, id: string) {
    const s = await prisma.parishLivestream.findFirst({ where: { id, organizationId: req.auth.organizationId } });
    if (!s) throw notFound("Transmisión no encontrada.");
    return s;
  }
  async function assertEvent(req: FastifyRequest, eventId: string | null | undefined) {
    if (!eventId) return;
    const ok = await prisma.event.findFirst({ where: { id: eventId, organizationId: req.auth.organizationId }, select: { id: true } });
    if (!ok) throw new AppError(400, "INVALID_EVENT", "El evento no pertenece a tu parroquia.");
  }
  const videoIdOf = (url: string) => {
    const id = parseYouTubeVideoId(url);
    if (!id) throw new AppError(400, "INVALID_YOUTUBE_URL", "Pega el enlace de un video o transmisión de YouTube (por ejemplo, https://www.youtube.com/live/… o https://youtu.be/…).");
    return id;
  };

  app.get("/", { preHandler: manage }, async (req) => {
    const items = await prisma.parishLivestream.findMany({ where: { organizationId: req.auth.organizationId }, orderBy: { createdAt: "desc" }, take: 30 });
    const refreshed = await Promise.all(items.map((s) => refreshVerified(s)));
    return { items: refreshed.map(livestreamView) };
  });

  app.post("/", { preHandler: manage, config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const body = createLivestreamSchema.parse(req.body);
    await assertEvent(req, body.eventId);
    const s = await prisma.parishLivestream.create({
      data: { organizationId: req.auth.organizationId, title: body.title, youtubeVideoId: videoIdOf(body.url), eventId: body.eventId ?? null, scheduledAt: body.scheduledAt ?? null, createdById: req.auth.id },
    });
    await audit(req, { action: "LIVESTREAM_CREATED", entityType: "ParishLivestream", entityId: s.id, metadata: { videoId: s.youtubeVideoId } });
    return reply.status(201).send(livestreamView(await refreshVerified(s)));
  });

  app.patch("/:id", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = updateLivestreamSchema.parse(req.body);
    const s = await own(req, id);
    if (s.status === "ENDED") throw new AppError(409, "LIVESTREAM_ENDED", "La transmisión ya finalizó.");
    await assertEvent(req, body.eventId);
    const u = await prisma.parishLivestream.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.url !== undefined ? { youtubeVideoId: videoIdOf(body.url), statusSource: "MANUAL", lastCheckedAt: null } : {}),
        ...(body.eventId !== undefined ? { eventId: body.eventId } : {}),
        ...(body.scheduledAt !== undefined ? { scheduledAt: body.scheduledAt } : {}),
      },
    });
    await audit(req, { action: "LIVESTREAM_UPDATED", entityType: "ParishLivestream", entityId: id, metadata: { fields: Object.keys(body) } });
    return livestreamView(u);
  });

  /** Marcar EN VIVO (acción explícita del personal). Una sola transmisión en vivo por parroquia. */
  app.post("/:id/start", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    await own(req, id);
    const other = await prisma.parishLivestream.findFirst({ where: { organizationId: req.auth.organizationId, status: "LIVE", id: { not: id } }, select: { title: true } });
    if (other) throw new AppError(409, "ANOTHER_LIVE", `Ya hay una transmisión en vivo («${other.title}»). Finalízala primero.`);
    const r = await prisma.parishLivestream.updateMany({ where: { id, organizationId: req.auth.organizationId, status: "SCHEDULED" }, data: { status: "LIVE", statusSource: "MANUAL", startedAt: new Date() } });
    if (r.count !== 1) throw new AppError(409, "LIVESTREAM_STATUS_CHANGED", "Solo se puede iniciar una transmisión programada.");
    await audit(req, { action: "LIVESTREAM_STARTED", entityType: "ParishLivestream", entityId: id });
    return livestreamView(await prisma.parishLivestream.findUniqueOrThrow({ where: { id } }));
  });

  app.post("/:id/end", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    await own(req, id);
    const r = await prisma.parishLivestream.updateMany({ where: { id, organizationId: req.auth.organizationId, status: "LIVE" }, data: { status: "ENDED", statusSource: "MANUAL", endedAt: new Date() } });
    if (r.count !== 1) throw new AppError(409, "LIVESTREAM_STATUS_CHANGED", "Solo se puede finalizar una transmisión en vivo.");
    await audit(req, { action: "LIVESTREAM_ENDED", entityType: "ParishLivestream", entityId: id });
    return livestreamView(await prisma.parishLivestream.findUniqueOrThrow({ where: { id } }));
  });

  /**
   * Invitar a los seguidores a verla: aviso en la bandeja + push (sistema de avisos existente). Una sola vez por
   * transmisión (marcado condicional) y solo con la parroquia aprobada, como los avisos manuales.
   */
  app.post("/:id/announce", { preHandler: manage, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const s = await own(req, id);
    if (s.status === "ENDED") throw new AppError(409, "LIVESTREAM_ENDED", "La transmisión ya finalizó.");
    assertOrgCan(req.auth.organizationStatus, "PUBLISH_EVENT");
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth.organizationId }, select: { name: true } });
    const n = await prisma.$transaction(async (tx) => {
      const claimed = await tx.parishLivestream.updateMany({ where: { id, announcedAt: null }, data: { announcedAt: new Date() } });
      if (claimed.count !== 1) throw new AppError(409, "ALREADY_ANNOUNCED", "Ya invitaste a los seguidores a esta transmisión.");
      const created = await notifyFollowers(tx, {
        organizationId: req.auth.organizationId, eventId: s.eventId, kind: "LIVESTREAM", createdById: req.auth.id,
        title: (s.status === "LIVE" ? `En vivo: ${s.title}` : `Transmisión: ${s.title}`).slice(0, 120),
        body: s.status === "LIVE"
          ? `${org.name} está transmitiendo en vivo. Entra al perfil de la parroquia para verla.`
          : `${org.name} transmitirá «${s.title}». Entra al perfil de la parroquia para verla cuando empiece.`,
      });
      await auditTx(tx, req, { action: "LIVESTREAM_ANNOUNCED", entityType: "ParishLivestream", entityId: id, metadata: { recipients: created.recipientCount } });
      return created;
    });
    void pushNotification(n);
    return reply.status(201).send({ recipientCount: n.recipientCount });
  });

  /** Borrar una transmisión que no está en vivo (la de YouTube no se toca). */
  app.delete("/:id", { preHandler: manage }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await own(req, id);
    const r = await prisma.parishLivestream.deleteMany({ where: { id, organizationId: req.auth.organizationId, status: { not: "LIVE" } } });
    if (r.count !== 1) throw new AppError(409, "LIVESTREAM_LIVE", "Finaliza la transmisión antes de quitarla.");
    await audit(req, { action: "LIVESTREAM_DELETED", entityType: "ParishLivestream", entityId: id });
    return reply.status(204).send();
  });
}
