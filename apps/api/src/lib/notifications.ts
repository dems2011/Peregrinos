import type { Notification, NotificationKind, Prisma } from "@prisma/client";
import { formatDate } from "@peregrinos/shared";
import { prisma } from "./prisma";
import { pushConfigured, sendPushToUsers } from "./push";

type Tx = Prisma.TransactionClient;

/**
 * B1 — Envía un aviso a TODOS los seguidores actuales de UNA parroquia (nunca a seguidores de otras). Se reparte en la
 * misma transacción: cada seguidor tiene su fila con readAt (bandeja con no leídos).
 */
export async function notifyFollowers(tx: Tx, input: {
  organizationId: string; eventId?: string | null; kind: NotificationKind; title: string; body: string; createdById?: string | null;
}) {
  const followers = await tx.parishFollower.findMany({ where: { organizationId: input.organizationId }, select: { userId: true } });
  const n = await tx.notification.create({
    data: {
      organizationId: input.organizationId, eventId: input.eventId ?? null, kind: input.kind,
      title: input.title.trim(), body: input.body.trim(), createdById: input.createdById ?? null, recipientCount: followers.length,
    },
  });
  if (followers.length) {
    await tx.notificationRecipient.createMany({ data: followers.map((f) => ({ notificationId: n.id, userId: f.userId })), skipDuplicates: true });
  }
  return n;
}

/** FCM admite hasta 4 KB por mensaje: el push lleva un extracto; el texto completo queda en la bandeja de la app. */
const PUSH_BODY_MAX = 500;

/**
 * Push de un aviso ya guardado: se llama DESPUÉS de confirmar la transacción que lo creó, sin esperar (`void`).
 * Destinatarios: los NotificationRecipient del aviso; dispositivos: sus DeviceToken activos (revokedAt IS NULL).
 * Nunca lanza: si FCM falla o no está configurado, el aviso de la bandeja ya existe y no se ve afectado.
 * Los tokens que FCM rechaza (no registrados o inválidos) quedan dados de baja (revokedAt).
 */
export async function pushNotification(n: Pick<Notification, "id" | "organizationId" | "eventId" | "title" | "body">) {
  if (!pushConfigured()) return;
  try {
    const recipients = await prisma.notificationRecipient.findMany({ where: { notificationId: n.id }, select: { userId: true } });
    if (!recipients.length) return;
    const body = n.body.length > PUSH_BODY_MAX ? `${n.body.slice(0, PUSH_BODY_MAX - 1).trimEnd()}…` : n.body;
    const data: Record<string, string> = { notificationId: n.id, organizationId: n.organizationId };
    if (n.eventId) data.eventId = n.eventId;
    const result = await sendPushToUsers(recipients.map((r) => r.userId), { title: n.title, body, data }, (userIds) =>
      prisma.deviceToken.findMany({ where: { userId: { in: userIds }, revokedAt: null }, select: { userId: true, token: true } }),
    );
    if (result.invalid.length) {
      await prisma.deviceToken.updateMany({ where: { token: { in: result.invalid.map((t) => t.token) }, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    if (result.sent || result.failed) {
      console.info(`[push] aviso ${n.id}: ${result.sent} enviados, ${result.failed} fallidos, ${result.invalid.length} tokens dados de baja`);
    }
  } catch (e) {
    console.error(`[push] No se pudo enviar el aviso ${n.id}:`, (e as Error).message);
  }
}

/** Estados en los que un evento se considera publicado para los seguidores. */
const PUBLISHED = ["SCHEDULED", "IN_PROGRESS"];

/**
 * B1 — Si el evento quedó público y publicado por primera vez (y la parroquia está aprobada), avisa a sus seguidores.
 * Una sola vez: el marcado de publishedNotifiedAt es condicional (dos guardados simultáneos no duplican el aviso).
 */
export async function notifyEventPublishedIfDue(tx: Tx, eventId: string, createdById?: string | null) {
  const e = await tx.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, status: true, visibility: true, startsAt: true, timezone: true, parishName: true, publishedNotifiedAt: true, organizationId: true, organization: { select: { name: true, status: true } } },
  });
  if (!e || e.publishedNotifiedAt || e.visibility !== "PUBLIC" || !PUBLISHED.includes(e.status) || e.organization.status !== "APPROVED") return null;
  const claimed = await tx.event.updateMany({ where: { id: e.id, publishedNotifiedAt: null }, data: { publishedNotifiedAt: new Date() } });
  if (claimed.count !== 1) return null;
  const parish = e.parishName ?? e.organization.name;
  return notifyFollowers(tx, {
    organizationId: e.organizationId, eventId: e.id, kind: "EVENT_PUBLISHED", createdById,
    title: `Nuevo evento: ${e.name}`.slice(0, 120),
    body: `${parish} publicó «${e.name}» para el ${formatDate(e.startsAt, { timeZone: e.timezone, monthName: true })}. Entra al perfil de la parroquia para ver los detalles e inscribirte.`,
  });
}
