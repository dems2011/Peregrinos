import type { Prisma } from "@prisma/client";
import { formatDateTime, hasPermission } from "@peregrinos/shared";
import { prisma } from "./prisma";
import { sendNotificationPush, type PushableNotification } from "./notifications";
import type { PushResult } from "./push";

type Tx = Prisma.TransactionClient;

/**
 * Turnos que SIGyP pide decidir al sacerdote (2026-10-27). Deciden las cuentas del PERSONAL activas de la organización
 * con el permiso turn:decide (el titular por su nivel, o a quien él se lo conceda). Nunca un peregrino.
 */
export async function turnDeciders(tx: Tx, organizationId: string): Promise<string[]> {
  const staff = await tx.user.findMany({ where: { organizationId, isActive: true, accountType: "STAFF" }, select: { id: true, role: true, extraPermissions: true } });
  return staff.filter((u) => u.role && hasPermission(u.role, u.extraPermissions, "turn:decide")).map((u) => u.id);
}

/** Aviso en la bandeja de quienes deciden (dentro de la misma transacción que el turno). El push sale DESPUÉS. */
export async function notifyTurnDeciders(tx: Tx, turn: { organizationId: string; title: string; startsAt: Date; location: string | null }, timeZone: string, reopened: boolean) {
  const userIds = await turnDeciders(tx, turn.organizationId);
  const when = formatDateTime(turn.startsAt, { timeZone, monthName: true });
  const n = await tx.notification.create({
    data: {
      organizationId: turn.organizationId, kind: "TURN_REQUEST", delivery: "PUSH", recipientCount: userIds.length,
      title: (reopened ? `Turno modificado: ${turn.title}` : `Turno para decidir: ${turn.title}`).slice(0, 120),
      body: `${when}${turn.location ? ` · ${turn.location}` : ""}. Acéptalo o recházalo en «Turnos».`,
    },
  });
  if (userIds.length) await tx.notificationRecipient.createMany({ data: userIds.map((userId) => ({ notificationId: n.id, userId })), skipDuplicates: true });
  return n;
}

export type TurnPushStatus = "SENT" | "FAILED" | "NO_DEVICES" | "NOT_CONFIGURED";
export type TurnPushSender = (n: PushableNotification) => Promise<PushResult | null>;

/**
 * Push del aviso de un turno, con reintentos solo cuando el proveedor falló por completo (ningún envío correcto). El
 * resultado queda en el turno (pushStatus, pushAttempts) y un fallo final se audita: así se sabe si el sacerdote fue
 * avisado en el teléfono. Sin FCM configurado o sin dispositivos registrados NO se reintenta y se informa tal cual.
 * El aviso en la bandeja de Peregrinos existe siempre, pase lo que pase con el push. Nunca lanza.
 */
export async function pushTurnNotification(
  turnId: string, n: PushableNotification,
  opts: { sender?: TurnPushSender; delaysMs?: readonly number[] } = {},
): Promise<{ status: TurnPushStatus; attempts: number }> {
  const sender = opts.sender ?? sendNotificationPush;
  const delays = opts.delaysMs ?? [2_000, 15_000];
  let attempts = 0;
  let status: TurnPushStatus;
  let lastError: string | null = null;
  for (;;) {
    attempts++;
    let r: PushResult | null | undefined;
    try { r = await sender({ ...n, extraData: { ...(n.extraData ?? {}), target: "turns" } }); } catch (e) { r = undefined; lastError = (e as Error).message.slice(0, 200); }
    if (r === null) { status = "NOT_CONFIGURED"; break; }
    if (r && r.sent > 0) { status = "SENT"; break; }
    if (r && r.failed === 0) { status = "NO_DEVICES"; break; }
    if (attempts > delays.length) { status = "FAILED"; break; }
    await new Promise((ok) => setTimeout(ok, delays[attempts - 1]));
  }
  try {
    await prisma.pastoralTurn.updateMany({ where: { id: turnId }, data: { pushStatus: status, pushAttempts: { increment: attempts } } });
    if (status === "FAILED") {
      await prisma.auditLog.create({ data: { action: "TURN_PUSH_FAILED", entityType: "PastoralTurn", entityId: turnId, organizationId: n.organizationId, metadata: { attempts, notificationId: n.id, error: lastError } } });
    }
  } catch (e) {
    console.error(`[push] No se pudo registrar el resultado del turno ${turnId}:`, (e as Error).message);
  }
  return { status, attempts };
}
