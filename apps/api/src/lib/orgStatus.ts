import type { AccountType, OrganizationStatus, Prisma } from "@prisma/client";

/**
 * A3 — Registro persistente (append-only) de transiciones de solicitudes y organizaciones.
 * Se escribe en la MISMA transacción que el cambio de estado: si uno falla, no queda ninguno.
 */
export function recordStatusChange(
  tx: Prisma.TransactionClient,
  data: {
    organizationId?: string | null;
    requestId?: string | null;
    fromStatus: OrganizationStatus | null;
    toStatus: OrganizationStatus;
    actor: { id: string; accountType: AccountType } | null; // null = solicitante público (sin cuenta)
    reason?: string | null;
  },
) {
  return tx.organizationStatusChange.create({
    data: {
      organizationId: data.organizationId ?? null,
      requestId: data.requestId ?? null,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      actorUserId: data.actor?.id ?? null,
      actorAccountType: data.actor?.accountType ?? null,
      reason: data.reason?.trim() || null,
    },
  });
}
