import type { FastifyInstance } from "fastify";
import { TRACKING_STALE_MS, trackingSettingsSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { eventParam, loadEvent } from "../lib/access";
import { purgeLocationsIfClosed } from "../lib/tracking";

/**
 * B5 — Seguimiento GPS en vivo para el personal (prefijo /api/events/:eventId/tracking). Solo participantes que lo
 * autorizaron explícitamente desde su acceso personal; solo la última posición (sin historial). El evento debe ser de la
 * organización (y, para un operador, tener un punto asignado): loadEvent.
 */
export default async function trackingRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requirePermission("tracking:read") }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    const event = await loadEvent(req, eventId);
    await purgeLocationsIfClosed(event);
    const rows = await prisma.locationShare.findMany({
      where: { eventId, latitude: { not: null } },
      select: {
        participantId: true, latitude: true, longitude: true, accuracyM: true, recordedAt: true, receivedAt: true, consentAt: true,
        participant: { select: { number: true, firstName: true, lastName: true, status: true } },
      },
      orderBy: { receivedAt: "desc" },
    });
    const sharing = await prisma.locationShare.count({ where: { eventId } });
    const now = Date.now();
    return {
      enabled: event.trackingEnabled,
      eventStatus: event.status,
      sharing,
      staleAfterMs: TRACKING_STALE_MS,
      serverTime: new Date(now).toISOString(),
      items: rows.filter((r) => r.participant.status === "ACTIVE").map((r) => ({
        participantId: r.participantId, number: r.participant.number, firstName: r.participant.firstName, lastName: r.participant.lastName,
        latitude: r.latitude, longitude: r.longitude, accuracyM: r.accuracyM, recordedAt: r.recordedAt, receivedAt: r.receivedAt,
        stale: !r.receivedAt || now - r.receivedAt.getTime() > TRACKING_STALE_MS,
      })),
    };
  });

  /** Activar o desactivar el seguimiento del evento. Desactivarlo borra todas las ubicaciones compartidas. */
  app.put("/settings", { preHandler: app.requirePermission("event:update") }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    const { trackingEnabled } = trackingSettingsSchema.parse(req.body);
    const event = await loadEvent(req, eventId);
    const removed = await prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: event.id }, data: { trackingEnabled } });
      return trackingEnabled ? 0 : (await tx.locationShare.deleteMany({ where: { eventId } })).count;
    });
    await audit(req, { action: trackingEnabled ? "TRACKING_ENABLED" : "TRACKING_DISABLED", entityType: "Event", entityId: eventId, eventId, metadata: { removedLocations: removed } });
    return { trackingEnabled, removedLocations: removed };
  });
}
