import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { cfg, parseServiceAccount } from "../config";

/**
 * Notificaciones push por Firebase Cloud Messaging (FCM). Opcional, como el correo: sin FIREBASE_SERVICE_ACCOUNT no
 * se inicializa Firebase y los envíos no hacen nada (los avisos siguen llegando a la bandeja de la app).
 */
const account = cfg.FIREBASE_SERVICE_ACCOUNT ? parseServiceAccount(cfg.FIREBASE_SERVICE_ACCOUNT) : null;

const messaging: Messaging | null = account
  ? getMessaging(getApps()[0] ?? initializeApp({ credential: cert(account), projectId: account.projectId }))
  : null;

/** Si el envío de push está configurado (se informa en /api/health). */
export const pushConfigured = () => messaging !== null;

if (!messaging && cfg.NODE_ENV === "production") {
  console.warn("[push no configurado] Falta FIREBASE_SERVICE_ACCOUNT: no se enviarán notificaciones push.");
}

export interface PushMessage {
  title: string;
  body: string;
  /** Datos para la app (p. ej. notificationId, organizationId, eventId). FCM solo admite valores de texto. */
  data?: Record<string, string>;
}

export interface PushTarget {
  userId: string;
  token: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens que FCM ya no acepta (app desinstalada, token renovado): quien llama debe borrarlos. */
  invalid: PushTarget[];
}

/** FCM acepta hasta 500 tokens por envío múltiple. */
const BATCH = 500;
/** Errores que significan que el token ya no sirve (no los errores del mensaje ni los temporales). */
const INVALID_TOKEN = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

/**
 * Envía la misma notificación a los dispositivos de varias cuentas. Los tokens los aporta quien llama (`tokensOf`),
 * para no acoplar este módulo a la base de datos. Nunca lanza: los errores se registran y se devuelven en el resultado.
 */
export async function sendPushToUsers(
  userIds: string[],
  message: PushMessage,
  tokensOf: (userIds: string[]) => Promise<PushTarget[]>,
): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, invalid: [] };
  if (!messaging || !userIds.length) return result;

  let targets: PushTarget[];
  try {
    targets = await tokensOf([...new Set(userIds)]);
  } catch (e) {
    console.error("[push] No se pudieron obtener los tokens:", (e as Error).message);
    return result;
  }

  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    try {
      const r = await messaging.sendEachForMulticast({
        tokens: batch.map((t) => t.token),
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: { priority: "high" },
      });
      result.sent += r.successCount;
      result.failed += r.failureCount;
      r.responses.forEach((res, j) => {
        if (!res.success && res.error && INVALID_TOKEN.has(res.error.code)) result.invalid.push(batch[j]);
      });
    } catch (e) {
      // Fallo del envío completo (red, credenciales): no se marca ningún token como inválido.
      result.failed += batch.length;
      console.error("[push] No se pudo enviar el lote:", (e as Error).message);
    }
  }
  return result;
}
