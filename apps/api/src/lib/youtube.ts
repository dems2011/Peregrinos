import { cfg } from "../config";

/**
 * B5 — YouTube como infraestructura de video (sin streaming propio). Aquí solo se interpreta la URL que carga la
 * parroquia y, si hay YOUTUBE_API_KEY (opcional, solo en el servidor), se verifica el estado real con YouTube Data API
 * v3 (videos.list: 1 unidad de cuota por consulta; la cuota diaria gratuita es de 10.000 unidades).
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);

/** Id del video (11 caracteres) a partir de un enlace de YouTube; null si no es un enlace de video de YouTube. */
export function parseYouTubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (VIDEO_ID.test(raw)) return raw;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!HOSTS.has(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (u.hostname.toLowerCase() === "youtu.be") id = parts[0] ?? null;
  else if (parts[0] === "watch") id = u.searchParams.get("v");
  else if (["live", "embed", "shorts", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
  return id && VIDEO_ID.test(id) ? id : null;
}

export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export interface VerifiedLiveStatus {
  status: "SCHEDULED" | "LIVE" | "ENDED";
  scheduledAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

export const youtubeApiConfigured = () => !!cfg.YOUTUBE_API_KEY;

/**
 * Estado verificado con YouTube Data API. null si no hay clave, si el video no existe o si la API falla (el estado
 * anterior se conserva; nunca se inventa). No incluye la clave en errores ni logs.
 */
export async function fetchVerifiedLiveStatus(videoId: string): Promise<VerifiedLiveStatus | null> {
  if (!cfg.YOUTUBE_API_KEY || !VIDEO_ID.test(videoId)) return null;
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoId}&key=${encodeURIComponent(cfg.YOUTUBE_API_KEY)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) { console.warn(`[youtube] videos.list respondió ${res.status}`); return null; }
    const body = (await res.json()) as { items?: { snippet?: { liveBroadcastContent?: string }; liveStreamingDetails?: Record<string, string | undefined> }[] };
    const item = body.items?.[0];
    if (!item) return null;
    const d = item.liveStreamingDetails ?? {};
    const date = (v?: string) => (v ? new Date(v) : null);
    const content = item.snippet?.liveBroadcastContent;
    const status = content === "live" ? "LIVE" : content === "upcoming" ? "SCHEDULED" : "ENDED";
    // Un video común (nunca fue transmisión) no se marca como transmisión terminada: no hay datos de vivo.
    if (status === "ENDED" && !d.actualEndTime && !d.actualStartTime) return null;
    return { status, scheduledAt: date(d.scheduledStartTime), startedAt: date(d.actualStartTime), endedAt: date(d.actualEndTime) };
  } catch (e) {
    console.warn("[youtube] no se pudo consultar el estado:", (e as Error).name);
    return null;
  }
}
