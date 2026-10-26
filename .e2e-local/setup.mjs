// Datos de prueba: organización demo aprobada + organización B aprobada con su ADMIN (misma contraseña del seed).
import { prisma } from "./db.mjs";

const a = await prisma.organization.findFirstOrThrow({ where: { name: "Organización Demo" } });
await prisma.organization.update({ where: { id: a.id }, data: { status: "APPROVED" } });
const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@peregrinos.local" } });
const b = await prisma.organization.create({ data: { name: "Organización B", status: "APPROVED" } });
await prisma.user.create({ data: { organizationId: b.id, email: "admin.b@peregrinos.local", name: "Admin B", role: "ADMIN", passwordHash: admin.passwordHash } });
await prisma.user.create({ data: { organizationId: b.id, email: "superadmin.b@peregrinos.local", name: "Super B", role: "SUPERADMIN", passwordHash: admin.passwordHash } });
await prisma.$disconnect();
console.log("SETUP_OK");
