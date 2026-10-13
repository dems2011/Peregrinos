import type { ParishLivestream } from "@prisma/client";
import { prisma } from "./prisma";
import { fetchVerifiedLiveStatus, youtubeApiConfigured, youtubeWatchUrl } from "./youtube";

/** Como mucho una consulta a YouTube por transmisión cada este intervalo (protege la cuota). */
const RECHECK_MS = 60_000;

export const livestreamView = (s: ParishLivestream) => ({
  id: s.id, title: s.title, eventId: s.eventId, videoId: s.youtubeVideoId, watchUrl: youtubeWatchUrl(s.youtubeVideoId),
  status: s.status, statusSource: s.statusSource, verified: s.statusSource === "YOUTUBE_API",
  scheduledAt: s.scheduledAt, startedAt: s.startedAt, endedAt: s.endedAt, announcedAt: s.announcedAt, createdAt: s.createdAt,
});

/**
 * Con YOUTUBE_API_KEY: actualiza el estado con el de YouTube (fuente verificable) si pasó RECHECK_MS desde la última
 * consulta. La actualización es condicional (no pisa un cambio simultáneo). Sin clave o si YouTube no responde, devuelve
 * la transmisión tal cual: nunca inventa un estado.
 */
export async function refreshVerified(s: ParishLivestream): Promise<ParishLivestream> {
  if (!youtubeApiConfigured() || s.status === "ENDED") return s;
  if (s.lastCheckedAt && Date.now() - s.lastCheckedAt.getTime() < RECHECK_MS) return s;
  const v = await fetchVerifiedLiveStatus(s.youtubeVideoId);
  const now = new Date();
  const r = await prisma.parishLivestream.updateMany({
    where: { id: s.id, updatedAt: s.updatedAt },
    data: v
      ? { status: v.status, statusSource: "YOUTUBE_API", scheduledAt: v.scheduledAt ?? s.scheduledAt, startedAt: v.startedAt ?? s.startedAt, endedAt: v.endedAt ?? s.endedAt, lastCheckedAt: now }
      : { lastCheckedAt: now },
  });
  return r.count ? prisma.parishLivestream.findUniqueOrThrow({ where: { id: s.id } }) : s;
}

/**
 * Transmisión a mostrar en el perfil público: la que está EN VIVO; si no, la próxima programada (o una programada sin
 * fecha). Las finalizadas no se muestran. null = fuera de línea.
 */
export async function currentLivestream(organizationId: string) {
  const live = await prisma.parishLivestream.findFirst({ where: { organizationId, status: "LIVE" }, orderBy: { startedAt: "desc" } });
  if (live) {
    const r = await refreshVerified(live);
    if (r.status === "LIVE") return livestreamView(r);
  }
  const next = await prisma.parishLivestream.findFirst({
    where: { organizationId, status: "SCHEDULED", OR: [{ scheduledAt: null }, { scheduledAt: { gte: new Date(Date.now() - 3 * 3600_000) } }] },
    orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
  if (!next) return null;
  const r = await refreshVerified(next);
  return r.status === "ENDED" ? null : livestreamView(r);
}
