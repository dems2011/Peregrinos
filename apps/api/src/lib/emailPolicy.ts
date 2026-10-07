import type { User } from "@prisma/client";
import { cfg } from "../config";
import { prisma } from "./prisma";

/**
 * BETA: con PILGRIM_EMAIL_VERIFICATION=optional (solo para operar sin SMTP), una cuenta PILGRIM activa que ingresa con
 * la contraseña correcta queda con el correo marcado como verificado. Con "required" (por defecto) devuelve null y el
 * ingreso sigue exigiendo el enlace del correo. Nunca afecta a cuentas del personal ni de plataforma.
 */
export async function acceptUnverifiedPilgrim(user: User): Promise<User | null> {
  if (cfg.PILGRIM_EMAIL_VERIFICATION !== "optional") return null;
  if (user.accountType !== "PILGRIM" || !user.isActive || user.emailVerifiedAt) return null;
  return prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
}
