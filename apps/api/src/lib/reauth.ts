import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { AppError } from "./errors";
import { verifyPassword } from "./password";

/**
 * Reautenticación con contraseña (D1) para las operaciones que conceden o quitan el control de la integración con SIGyP
 * (crear códigos de vinculación y credenciales, liberar el perfil). La contraseña viaja en el cuerpo de LA MISMA
 * petición y se verifica en el servidor contra la cuenta autenticada en ese momento: la vigencia es esa petición, no
 * queda ningún permiso reutilizable que se pueda repetir ni trasladar a otra sesión u otra cuenta. Nunca se guarda ni se
 * registra (el registro de peticiones no incluye cuerpos; la auditoría guarda solo el propósito). Se aplica además del
 * segundo factor reciente (requireRecentMfa) cuando la cuenta lo tiene activo. Las rutas que la usan tienen límite de
 * frecuencia; cada fallo queda auditado.
 */
export async function assertPasswordReauth(req: FastifyRequest, password: string, purpose: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.auth.id }, select: { passwordHash: true, isActive: true } });
  const ok = !!user?.isActive && !!user.passwordHash && (await verifyPassword(user.passwordHash, password));
  if (ok) return;
  await audit(req, { action: "REAUTH_FAILED", entityType: "User", entityId: req.auth.id, metadata: { purpose } });
  throw new AppError(403, "REAUTH_FAILED", "La contraseña no es correcta. Vuelve a escribirla para confirmar la operación.");
}
