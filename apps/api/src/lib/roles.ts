import type { Role } from "@peregrinos/shared";
import { AppError, forbidden } from "./errors";

/**
 * A1 — Único punto de control del rol SUPERADMIN.
 *
 * SUPERADMIN solo puede asignarse de dos maneras, ambas en el servidor:
 *  1. Inicialización del sistema (POST /auth/bootstrap): una sola vez, con la BD sin usuarios.
 *  2. Promoción de un miembro ACTIVO del personal de la MISMA organización por un SUPERADMIN,
 *     vía PATCH /users/:id, pasando por assertCanPromoteToSuperadmin().
 *
 * Quedan prohibidos: registro público, alta directa (POST /users) e invitaciones (enlace al portador).
 */

/** Alta directa o invitación: nunca SUPERADMIN. */
export function assertNotSuperadminGrant(target: Role, via: "USER_CREATE" | "INVITATION") {
  if (target === "SUPERADMIN") {
    throw new AppError(
      403,
      "SUPERADMIN_GRANT_NOT_ALLOWED",
      via === "INVITATION"
        ? "No se puede invitar como superadministrador. Invita con otro nivel y luego promueve a la persona desde Usuarios."
        : "No se puede crear un superadministrador directamente. Crea la cuenta con otro nivel y luego promuévela."
    );
  }
}

/** Promoción a SUPERADMIN: el que otorga debe ser SUPERADMIN, no puede ser él mismo y el destino debe estar activo. */
export function assertCanPromoteToSuperadmin(
  granter: { id: string; role: Role; accountType: string; organizationId: string },
  target: { id: string; isActive: boolean; accountType: string; organizationId: string | null }
) {
  if (granter.accountType !== "STAFF" || granter.role !== "SUPERADMIN") throw forbidden();
  if (target.accountType !== "STAFF" || target.organizationId !== granter.organizationId) throw forbidden();
  if (target.id === granter.id) throw new AppError(409, "SELF_PROMOTION", "No puedes cambiar tu propio nivel a superadministrador.");
  if (!target.isActive) throw new AppError(409, "TARGET_INACTIVE", "Solo se puede promover a una cuenta activa.");
}
