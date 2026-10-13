"use client";
import { ApiError, post } from "@/lib/api";

/**
 * B5 — Ubicación con la app minimizada o la pantalla apagada (solo la app Android, con el plugin
 * @capacitor-community/background-geolocation instalado por scripts/android-background-gps.ps1). En el navegador, o en
 * una APK anterior sin el plugin, `backgroundLocation()` devuelve null y ShareLocation usa navigator.geolocation (solo con
 * la pantalla abierta).
 *
 * El plugin corre un servicio en primer plano de tipo «location» con una notificación fija («Peregrinos está compartiendo
 * tu ubicación»): Android lo permite sin ACCESS_BACKGROUND_LOCATION porque el usuario lo inicia con la app abierta y
 * siempre ve que está activo. Al quitar el watcher, el servicio y la notificación desaparecen.
 */
export interface BgLocation { latitude: number; longitude: number; accuracy: number | null; time: number | null }
interface BgError { code?: string; message: string }
interface BgPlugin {
  addWatcher(
    options: { backgroundMessage?: string; backgroundTitle?: string; requestPermissions?: boolean; stale?: boolean; distanceFilter?: number },
    callback: (location?: BgLocation, error?: BgError) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

/** Envuelto ({ bg }): un plugin de Capacitor es un proxy y una promesa que se resuelve con él busca su `.then`. */
export async function backgroundLocation(): Promise<{ bg: BgPlugin } | null> {
  if (typeof window === "undefined") return null;
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android" || !Capacitor.isPluginAvailable("BackgroundGeolocation")) return null;
  return { bg: registerPlugin<BgPlugin>("BackgroundGeolocation") };
}

/** Distancia mínima entre posiciones del plugin; además ShareLocation respeta el intervalo mínimo del servidor. */
export const BG_DISTANCE_FILTER_M = 25;

/**
 * Con la app en segundo plano Android frena las peticiones del WebView (a los ~5 min). En la app se envía con el HTTP
 * nativo de Capacitor (CapacitorHttp), que usa las cookies del WebView. Si el servidor no reconoce la sesión por esa vía
 * (401), se vuelve a fetch para el resto de la sesión: nunca queda peor que antes.
 */
let nativeHttp = true;
export async function sendPing(body: { latitude: number; longitude: number; accuracy: number | null; recordedAt: string }, native: boolean) {
  if (native && nativeHttp) {
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      const r = await CapacitorHttp.post({ url: `${window.location.origin}/api/pilgrim/tracking/ping`, headers: { "Content-Type": "application/json" }, data: body });
      if (r.status === 401) nativeHttp = false;
      else if (r.status >= 400) {
        const d = (typeof r.data === "object" && r.data) || {};
        throw new ApiError(r.status, d.message ?? "No se pudo enviar la ubicación.", d.error);
      } else return;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if ((e as { code?: string })?.code !== "UNIMPLEMENTED") throw new ApiError(0, "Sin conexión.", "NETWORK");
      nativeHttp = false; // HTTP nativo no disponible en esta APK: fetch del WebView
    }
  }
  await post("/pilgrim/tracking/ping", body);
}
