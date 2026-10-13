import type { FastifyInstance, FastifyRequest } from "fastify";
import { TRACKING_MIN_INTERVAL_MS, locationPingSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError } from "../lib/errors";
import { purgeLocationsIfClosed, trackingOpen } from "../lib/tracking";

/**
 * B5 — Compartir la ubicación desde el acceso personal del peregrino (prefijo /api/pilgrim/tracking). Opt-in explícito:
 * nada se envía sin el consentimiento (POST /consent) y se deja de compartir en cualquier momento (DELETE /, que borra la
 * última posición). Solo participantes oficiales, con el evento EN CURSO y el seguimiento activado por la parroquia.
 */
export default async function pilgrimTrackingRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticatePilgrim };

  async function context(req: FastifyRequest) {
    const participantId = req.pilgrim.participantId;
    const event = await prisma.event.findUniqueOrThrow({ where: { id: req.pilgrim.eventId }, select: { id: true, status: true, trackingEnabled: true, name: true } });
    return { participantId, event };
  }

  app.get("/", auth, async (req) => {
    const { participantId, event } = await context(req);
    await purgeLocationsIfClosed(event);
    const share = participantId ? await prisma.locationShare.findUnique({ where: { participantId }, select: { consentAt: true, receivedAt: true } }) : null;
    return {
      available: !!participantId && trackingOpen(event),
      reason: !participantId ? "NOT_PARTICIPANT" : !event.trackingEnabled ? "DISABLED" : event.status !== "IN_PROGRESS" ? "EVENT_NOT_IN_PROGRESS" : null,
      sharing: !!share, consentAt: share?.consentAt ?? null, lastSentAt: share?.receivedAt ?? null,
      minIntervalMs: TRACKING_MIN_INTERVAL_MS,
    };
  });

  app.post("/consent", { ...auth, config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const { participantId, event } = await context(req);
    if (!participantId) throw new AppError(409, "NOT_PARTICIPANT", "Solo los participantes confirmados pueden compartir su ubicación.");
    if (!trackingOpen(event)) throw new AppError(409, "TRACKING_UNAVAILABLE", "El seguimiento no está disponible para este evento en este momento.");
    await prisma.locationShare.upsert({ where: { participantId }, create: { participantId, eventId: event.id }, update: {} });
    await audit(req, { action: "LOCATION_SHARING_STARTED", entityType: "Participant", entityId: participantId, eventId: event.id });
    return reply.status(201).send({ sharing: true });
  });

  /** Posición actual. Frecuencia limitada (también en el cliente) para cuidar batería, datos y servidor. */
  app.post("/ping", { ...auth, config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req) => {
    const { participantId, event } = await context(req);
    const body = locationPingSchema.parse(req.body);
    if (!participantId) throw new AppError(409, "NOT_PARTICIPANT", "Solo los participantes confirmados pueden compartir su ubicación.");
    if (!trackingOpen(event)) {
      // Evento terminado o seguimiento apagado: se deja de compartir y no se guarda nada.
      await prisma.locationShare.deleteMany({ where: { participantId } });
      throw new AppError(409, "TRACKING_UNAVAILABLE", "El seguimiento ya no está disponible para este evento.");
    }
    const now = Date.now();
    if (body.recordedAt.getTime() > now + 2 * 60_000 || body.recordedAt.getTime() < now - 3600_000) {
      throw new AppError(400, "STALE_POSITION", "La hora de la posición no es válida.");
    }
    // Solo actualiza si ya hay consentimiento (no lo crea): sin opt-in no se guarda ninguna posición.
    const r = await prisma.locationShare.updateMany({
      where: { participantId, eventId: event.id },
      data: { latitude: body.latitude, longitude: body.longitude, accuracyM: body.accuracy ?? null, recordedAt: body.recordedAt, receivedAt: new Date() },
    });
    if (r.count !== 1) throw new AppError(409, "NO_CONSENT", "Primero activa «Compartir mi ubicación».");
    return { ok: true, nextInMs: TRACKING_MIN_INTERVAL_MS };
  });

  /** Dejar de compartir: borra la última posición y el consentimiento. */
  app.delete("/", auth, async (req) => {
    const { participantId, event } = await context(req);
    if (!participantId) return { sharing: false };
    const r = await prisma.locationShare.deleteMany({ where: { participantId } });
    if (r.count) await audit(req, { action: "LOCATION_SHARING_STOPPED", entityType: "Participant", entityId: participantId, eventId: event.id });
    return { sharing: false };
  });
}
