import type { Prisma } from "@prisma/client";

/** Credenciales de SIGyP activas por organización (las crea el panel o se entregan al completar una vinculación). */
export const MAX_ACTIVE_SIGYP_CLIENTS = 3;
/** Códigos de vinculación vigentes (sin usar, sin revocar y sin vencer) por organización. */
export const MAX_ACTIVE_LINK_CODES = 3;

/**
 * D4: los límites se cuentan y se aplican dentro de la MISMA transacción, después de bloquear la fila de la organización
 * (SELECT … FOR UPDATE). Dos peticiones simultáneas de la misma organización quedan en fila: la segunda cuenta después
 * de que la primera confirmó, así el límite no se supera. Organizaciones distintas no se bloquean entre sí.
 */
export async function lockOrganization(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
}
