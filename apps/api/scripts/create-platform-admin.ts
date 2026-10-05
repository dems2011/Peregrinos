/**
 * A3 — Alta de un operador de plataforma (PLATFORM_ADMIN). ÚNICO mecanismo de creación: no existe ruta pública.
 *
 * Uso (PowerShell):
 *   $env:PLATFORM_ADMIN_EMAIL="ops@ejemplo.org"; $env:PLATFORM_ADMIN_NAME="Operación"; $env:PLATFORM_ADMIN_PASSWORD="<clave larga>"
 *   npm.cmd run platform:create-admin -- --confirm-host=<host de DATABASE_URL>
 *
 * Salvaguardas:
 *  - exige --confirm-host igual al host de DATABASE_URL (evita escribir en la base equivocada, p. ej. Neon);
 *  - no sobrescribe cuentas existentes;
 *  - la BD impone que una cuenta PLATFORM no tenga organización, rol ni permisos extra (CHECK);
 *  - deja constancia en AuditLog.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.PLATFORM_ADMIN_NAME?.trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  const dbUrl = process.env.DATABASE_URL;
  const confirm = process.argv.find((a) => a.startsWith("--confirm-host="))?.split("=")[1];

  if (!dbUrl) throw new Error("Falta DATABASE_URL.");
  const host = new URL(dbUrl).hostname;
  if (!confirm || confirm !== host) {
    throw new Error(`Confirmación requerida: vuelve a ejecutar con --confirm-host=${host} si realmente quieres escribir en esa base.`);
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("PLATFORM_ADMIN_EMAIL inválido.");
  if (!name || name.length < 2) throw new Error("PLATFORM_ADMIN_NAME inválido.");
  if (password.length < 12) throw new Error("PLATFORM_ADMIN_PASSWORD debe tener al menos 12 caracteres.");

  const prisma = new PrismaClient();
  try {
    if (await prisma.user.findUnique({ where: { email } })) throw new Error("Ya existe una cuenta con ese correo. No se modifica.");
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, name, passwordHash: await hashPassword(password), accountType: "PLATFORM" },
      });
      await tx.auditLog.create({
        data: { action: "PLATFORM_ADMIN_CREATED", entityType: "User", entityId: created.id, userId: created.id, metadata: { via: "scripts/create-platform-admin.ts" } },
      });
      return created;
    });
    console.log(`Operador de plataforma creado: ${user.email} (${user.id}) en ${host}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
