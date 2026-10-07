import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eventParam, loadEvent } from "../lib/access";
import { audit } from "../lib/audit";
import { hideMessage, listMessages, postMessage, type ChatViewer } from "../lib/chat";

/** B1 — Chat del evento para el personal (prefijo /api/events/:eventId/chat). Acceso = acceso al evento (loadEvent). */
export default async function chatRoutes(app: FastifyInstance) {
  const read = app.requirePermission("event:read");
  const viewerOf = (req: { auth: { id: string; role: string } }): ChatViewer =>
    ({ kind: "STAFF", userId: req.auth.id, canModerate: req.auth.role === "SUPERADMIN" || req.auth.role === "ADMIN" });

  app.get("/", { preHandler: read }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    return listMessages(eventId, viewerOf(req), req.query);
  });

  app.post("/", { preHandler: read, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    return reply.status(201).send(await postMessage(eventId, viewerOf(req), req.body));
  });

  app.delete("/:messageId", { preHandler: read }, async (req) => {
    const { eventId, messageId } = eventParam.extend({ messageId: z.string().uuid() }).parse(req.params);
    await loadEvent(req, eventId);
    await hideMessage(eventId, messageId, viewerOf(req));
    await audit(req, { action: "CHAT_MESSAGE_HIDDEN", entityType: "EventChatMessage", entityId: messageId, eventId });
    return { hidden: true };
  });
}
