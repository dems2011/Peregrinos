"use client";
import { api, post } from "@/lib/api";

/**
 * Notificaciones push en la app Android (Capacitor + @capacitor/push-notifications). En el navegador no hace nada.
 *
 * - Solo con sesión de la cuenta del peregrino: AccountProvider llama a enablePushForAccount() al confirmar la sesión
 *   y a disablePushForAccount() antes de cerrarla.
 * - Los listeners se registran una sola vez para toda la app (PushHandler → initPushListeners); PushHandler abre la
 *   pantalla del aviso al tocar una notificación y muestra un aviso en la app si llega con la app abierta.
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

/** Se emite en `window` (detail: PushTarget) cuando el usuario toca una notificación; lo atiende PushHandler. */
export const PUSH_OPEN_EVENT = "pg:push-open";
/** Se emite en `window` (detail: PushReceived) cuando llega un push con la app abierta (aviso en la app, refrescar). */
export const PUSH_RECEIVED_EVENT = "pg:push-received";

export interface PushReceived { target: PushTarget; title: string; body: string }

/** Canal de Android para los avisos (también es el canal por defecto del manifest: default_notification_channel_id). */
export const PUSH_CHANNEL_ID = "avisos";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extrae los datos del push; null si faltan o no son identificadores válidos. FCM entrega los valores como texto. */
export function toPushTarget(data: unknown): PushTarget | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.notificationId !== "string" || !UUID.test(d.notificationId)) return null;
  if (typeof d.organizationId !== "string" || !UUID.test(d.organizationId)) return null;
  return { notificationId: d.notificationId, organizationId: d.organizationId, ...(typeof d.eventId === "string" && UUID.test(d.eventId) ? { eventId: d.eventId } : {}) };
}

/**
 * Pantalla existente para un aviso: con evento, el perfil de la parroquia (lista sus eventos con «Inscribirme») con ese
 * evento resaltado; sin evento, la bandeja de avisos con ese aviso abierto.
 */
export function pushTargetHref(t: PushTarget): string {
  return t.eventId
    ? `/parroquias/${t.organizationId}?evento=${t.eventId}`
    : `/cuenta/avisos?aviso=${t.notificationId}`;
}

/** Marca el aviso como leído (idempotente). La bandeja lo hace sola al abrirlo; el perfil de la parroquia no. */
export function markPushRead(t: PushTarget) {
  if (t.eventId) void post(`/auth/account/notifications/${t.notificationId}/read`).catch(() => undefined);
}

/** Toque pendiente sin consumirlo (para comprobar la sesión antes de abrirlo). */
export function peekPendingPushOpen(): PushTarget | null {
  return pendingOpen;
}

/** Devuelve y consume el toque pendiente. */
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
      if (target) window.dispatchEvent(new CustomEvent<PushReceived>(PUSH_RECEIVED_EVENT, { detail: { target, title: n.title ?? "Nuevo aviso", body: n.body ?? "" } }));
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
 * Listeners en toda la app (sin pedir permiso ni registrar): así se recibe el toque que abrió la app aunque llegue
 * antes de iniciar sesión (el plugin lo retiene hasta que hay un listener). Lo llama PushHandler al montar.
 */
export async function initPushListeners() {
  try {
    const push = await plugin();
    if (push) await ensureListeners(push);
  } catch (e) {
    console.warn("[push] No se pudieron preparar las notificaciones:", e instanceof Error ? e.message : e);
  }
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
    // Canal propio (Android 8+), con importancia alta para que el aviso se vea como notificación emergente.
    await push.createChannel({ id: PUSH_CHANNEL_ID, name: "Avisos de tus parroquias", description: "Avisos y eventos nuevos de las parroquias que sigues", importance: 4, visibility: 1 }).catch(() => undefined);
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
