"use client";
import { api } from "@/lib/api";

/**
 * Notificaciones push en la app Android (Capacitor + @capacitor/push-notifications). En el navegador no hace nada.
 *
 * - Solo con sesión de la cuenta del peregrino: AccountProvider llama a enablePushForAccount() al confirmar la sesión
 *   y a disablePushForAccount() antes de cerrarla.
 * - El token FCM vive solo en memoria (no en localStorage): register() lo vuelve a entregar en cada inicio de la app.
 * - El mismo token puede pasar a otra cuenta: el endpoint de registro lo reasigna.
 * - Nunca lanza: un fallo de permisos, de FCM o de la API no afecta al ingreso ni al cierre de sesión.
 */

/** Datos que el API envía con cada push (ver pushNotification en apps/api/src/lib/notifications.ts). */
export interface PushTarget {
  notificationId: string;
  organizationId: string;
  eventId?: string;
}

/** Se emite en `window` (detail: PushTarget) cuando el usuario toca una notificación. La navegación es un paso aparte. */
export const PUSH_OPEN_EVENT = "pg:push-open";
/** Se emite en `window` (detail: PushTarget) cuando llega un push con la app abierta (p. ej. para refrescar avisos). */
export const PUSH_RECEIVED_EVENT = "pg:push-received";

let token: string | null = null;
/** true mientras haya sesión de cuenta: un token que llega tarde (tras cerrar sesión) no se registra. */
let active = false;
let listeners: Promise<void> | null = null;
/** Último toque recibido antes de que alguien lo atienda (la app pudo abrirse desde la notificación). */
let pendingOpen: PushTarget | null = null;

async function plugin() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android" || !Capacitor.isPluginAvailable("PushNotifications")) return null;
  return (await import("@capacitor/push-notifications")).PushNotifications;
}

/** Extrae los datos del push; null si faltan los obligatorios. FCM entrega los valores como texto. */
export function toPushTarget(data: unknown): PushTarget | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.notificationId !== "string" || typeof d.organizationId !== "string") return null;
  return { notificationId: d.notificationId, organizationId: d.organizationId, ...(typeof d.eventId === "string" && d.eventId ? { eventId: d.eventId } : {}) };
}

/** Devuelve y consume el toque pendiente (para el paso de navegación). */
export function takePendingPushOpen(): PushTarget | null {
  const t = pendingOpen;
  pendingOpen = null;
  return t;
}

async function sendToken(t: string) {
  try {
    await api("/auth/account/devices", { method: "POST", body: JSON.stringify({ token: t, platform: "ANDROID" }) });
  } catch (e) {
    console.warn("[push] No se pudo registrar el dispositivo:", e instanceof Error ? e.message : e);
  }
}

function ensureListeners(push: NonNullable<Awaited<ReturnType<typeof plugin>>>) {
  listeners ??= (async () => {
    await push.addListener("registration", ({ value }) => {
      token = value;
      if (active) void sendToken(value);
    });
    await push.addListener("registrationError", (err) => console.warn("[push] Error de registro en FCM:", err.error));
    await push.addListener("pushNotificationReceived", (n) => {
      const target = toPushTarget(n.data);
      if (target) window.dispatchEvent(new CustomEvent<PushTarget>(PUSH_RECEIVED_EVENT, { detail: target }));
    });
    await push.addListener("pushNotificationActionPerformed", (a) => {
      const target = toPushTarget(a.notification.data);
      if (!target) return;
      pendingOpen = target;
      window.dispatchEvent(new CustomEvent<PushTarget>(PUSH_OPEN_EVENT, { detail: target }));
    });
  })();
  return listeners;
}

/**
 * Con sesión de cuenta confirmada: pide permiso si corresponde (Android 13+: POST_NOTIFICATIONS), registra el
 * dispositivo en FCM y envía el token al API (el listener "registration" lo recibe).
 */
export async function enablePushForAccount() {
  try {
    const push = await plugin();
    if (!push) return;
    active = true;
    await ensureListeners(push);
    let perm = await push.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await push.requestPermissions();
    if (perm.receive !== "granted") return;
    // Entrega el token (también uno ya conocido) en "registration", que lo envía al API: así el token se renueva o pasa
    // a la cuenta actual en cada inicio de sesión.
    await push.register();
  } catch (e) {
    console.warn("[push] No se pudieron activar las notificaciones:", e instanceof Error ? e.message : e);
  }
}

/** Espera máxima de la baja: el cierre de sesión no queda colgado si el API tarda (p. ej. arranque en frío). */
const REVOKE_TIMEOUT_MS = 5000;

/** Antes de cerrar la sesión de cuenta: da de baja el token en el API (necesita la sesión todavía abierta). */
export async function disablePushForAccount() {
  active = false;
  if (!token) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REVOKE_TIMEOUT_MS);
  try {
    await api("/auth/account/devices", { method: "DELETE", body: JSON.stringify({ token }), signal: ctrl.signal });
  } catch (e) {
    console.warn("[push] No se pudo dar de baja el dispositivo:", e instanceof Error ? e.message : e);
  } finally {
    clearTimeout(timer);
  }
}
