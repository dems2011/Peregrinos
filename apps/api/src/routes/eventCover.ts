import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { eventParam, loadEvent } from "../lib/access";
import { readSingleFile } from "../lib/image";
import { contentImageUrls, prepareContentImage, replaceContentImage } from "../lib/contentImages";

/**
 * B5 — Portada del evento (prefijo /api/events/:eventId/cover). Permiso post:manage («Publicaciones y fotografías»).
 * Es la imagen de la publicación del evento en el perfil público: no hay una segunda sección de eventos.
 */
export default async function eventCoverRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("post:manage");

  app.get("/", { preHandler: app.requirePermission("event:read") }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    return { cover: await contentImageUrls("EVENT_COVER", eventId) };
  });

  app.put("/", { preHandler: manage, config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    const event = await loadEvent(req, eventId);
    const images = await prepareContentImage("EVENT_COVER", await readSingleFile(req));
    const original = images[0];
    await prisma.$transaction(async (tx) => {
      await replaceContentImage(tx, { organizationId: event.organizationId, ownerType: "EVENT_COVER", ownerId: eventId, createdById: req.auth.id, images });
      await auditTx(tx, req, { action: "EVENT_COVER_UPLOADED", entityType: "Event", entityId: eventId, eventId, metadata: { width: original.width, height: original.height, bytes: original.sizeBytes } });
    });
    return { cover: await contentImageUrls("EVENT_COVER", eventId) };
  });

  app.delete("/", { preHandler: manage }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    await prisma.contentImage.deleteMany({ where: { ownerType: "EVENT_COVER", ownerId: eventId } });
    await audit(req, { action: "EVENT_COVER_REMOVED", entityType: "Event", entityId: eventId, eventId });
    return { cover: null };
  });
}
