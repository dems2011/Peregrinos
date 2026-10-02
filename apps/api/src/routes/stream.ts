import type { FastifyInstance } from "fastify";
import { hasPermission } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { eventParam, loadEvent } from "../lib/access";
import { subscribe, type BusMessage } from "../lib/bus";

/**
 * Actualizaciones en vivo del evento (Server-Sent Events).
 * Mensajes: checkin.created · checkin.updated · participants.changed · registration.updated · participant.created
 * Los de pagos solo llegan a quien tiene permiso de revisar pagos.
 */
export default async function streamRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requirePermission("event:read") }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const canReviewPayments = hasPermission(req.auth.role, req.auth.extraPermissions, "payment:review");
    const userId = req.auth.id;

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      ...reply.getHeaders(),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    const write = (m: BusMessage) => res.write(`data: ${JSON.stringify(m)}\n\n`);
    write({ type: "hello", data: {} });

    const unsubscribe = subscribe(eventId, (m) => {
      if (m.type.startsWith("registration.") && !canReviewPayments) return;
      write(m);
    });
    // Latido cada 25 s (evita que proxies cierren la conexión) y corte si el usuario fue desactivado.
    const beat = setInterval(async () => {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } }).catch(() => null);
      if (!u?.isActive) { res.end(); return; }
      res.write(": ping\n\n");
    }, 25_000);
    req.raw.on("close", () => { clearInterval(beat); unsubscribe(); });
  });
}
