import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { newQrToken } from "../src/lib/tokens";
import { formatCode, hashAccess, newAccessCode, newAccessToken } from "../src/lib/pilgrim";

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? "Peregrinos2026!";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("El seed con datos demo no debe ejecutarse en producción.");
  }
  const passwordHash = await hashPassword(PASSWORD);

  const org = (await prisma.organization.findFirst({ where: { name: "Organización Demo" } })) ??
    (await prisma.organization.create({ data: { name: "Organización Demo" } }));

  const mkUser = (email: string, name: string, role: "SUPERADMIN" | "ADMIN" | "OPERATOR") =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: { organizationId: org.id, email, name, role, passwordHash },
    });

  await mkUser("superadmin@peregrinos.local", "Super Admin", "SUPERADMIN");
  await mkUser("admin@peregrinos.local", "Ana Administradora", "ADMIN");
  const carlos = await mkUser("carlos@peregrinos.local", "Carlos", "OPERATOR");
  const maria = await mkUser("maria.operadora@peregrinos.local", "María", "OPERATOR");
  const juan = await mkUser("juan.operador@peregrinos.local", "Juan", "OPERATOR");

  let event = await prisma.event.findFirst({ where: { organizationId: org.id, name: "Peregrinación de Luján 2026" } });
  if (event) {
    console.log("Los datos demo ya existen. Usa `npm run db:reset` para empezar de cero.");
    return;
  }
  event = await prisma.event.create({
    data: {
      organizationId: org.id,
      name: "Peregrinación de Luján 2026",
      description: "Caminata anual con cuatro puntos de control.",
      startsAt: new Date("2026-10-02T09:00:00-03:00"),
      status: "IN_PROGRESS",
      parishName: "Parroquia Nuestra Señora de Luján",
      registrationOpen: true,
      registrationToken: "demo-inscripcion-lujan-2026-token-de-prueba",
      registrationFee: 15000,
      paymentInstructions: "Transferencia al alias PARROQUIA.LUJAN.2026 (titular: Parroquia). Envía la foto del comprobante desde la app.",
    },
  });

  const pts = [
    { order: 1, name: "Parroquia", address: "Av. Díaz Vélez 4850", latitude: -34.6037, longitude: -58.4421, capacity: 50 },
    { order: 2, name: "Plaza San Martín", address: "Av. San Martín y Corrientes", latitude: -34.5975, longitude: -58.4290, capacity: 50 },
    { order: 3, name: "Parque Central", address: "Av. del Libertador 2000", latitude: -34.5880, longitude: -58.4100, capacity: 50 },
    { order: 4, name: "Santuario", address: "Av. Rivadavia 5000", latitude: -34.6100, longitude: -58.4350, capacity: 50 },
  ];
  const cps = [];
  for (const p of pts) cps.push(await prisma.checkpoint.create({ data: { ...p, eventId: event.id } }));

  const people = [
    [1, "Juan", "Pérez", "32456789", "+54 9 11 2345 6789"],
    [2, "María", "González", "28765432", "+54 9 11 3456 7890"],
    [3, "Carlos", "Rodríguez", "37654321", "+54 9 11 4567 8901"],
    [4, "Laura", "Martínez", "41987654", "+54 9 11 5678 9012"],
    [5, "Diego", "Fernández", "36543210", "+54 9 11 6789 0123"],
  ] as const;
  const parts = [];
  for (const [number, firstName, lastName, documentNumber, phone] of people) {
    parts.push(await prisma.participant.create({
      data: { eventId: event.id, number, firstName, lastName, documentNumber, phone, phoneDigits: phone.replace(/\D/g, ""), qrToken: newQrToken() },
    }));
  }

  // Operadores: Carlos -> Punto 1, María -> Punto 2, Juan -> Punto 3
  for (const [u, cp] of [[carlos, cps[0]], [maria, cps[1]], [juan, cps[2]]] as const) {
    await prisma.operatorAssignment.create({ data: { userId: u.id, checkpointId: cp.id, eventId: event.id } });
  }

  // Llegadas demo (02/10/2026)
  const at = (hhmm: string) => new Date(`2026-10-02T${hhmm}:00-03:00`);
  const demo: [number, number, string, typeof carlos, "NUMBER" | "QR" | "SEARCH"][] = [
    [1, 0, "10:15", carlos, "QR"],
    [2, 0, "10:27", carlos, "NUMBER"],
    [3, 0, "09:52", carlos, "QR"],
    [2, 1, "11:15", maria, "QR"],
    [1, 1, "11:20", maria, "QR"],
    [2, 2, "12:03", juan, "SEARCH"],
  ];
  for (const [pi, ci, hhmm, op, method] of demo) {
    await prisma.checkin.create({
      data: {
        eventId: event.id, participantId: parts[pi - 1].id, checkpointId: cps[ci].id,
        operatorId: op.id, timestamp: at(hhmm), method, deviceId: "seed",
      },
    });
  }

  // Operador con altas (puede agregar participantes) asignado al Santuario
  const laura = await prisma.user.upsert({
    where: { email: "laura.altas@peregrinos.local" }, update: {},
    create: { organizationId: org.id, email: "laura.altas@peregrinos.local", name: "Laura (con altas)", role: "OPERATOR", passwordHash, extraPermissions: ["participant:create"] },
  });
  await prisma.operatorAssignment.create({ data: { userId: laura.id, checkpointId: cps[3].id, eventId: event.id } });

  // Contactos que verá el peregrino
  await prisma.eventContact.createMany({
    data: [
      { eventId: event.id, name: "Coordinación general", roleLabel: "Organización", phone: "+54 9 11 5000 0001", isEmergency: true, sortOrder: 0 },
      { eventId: event.id, name: "Equipo médico", roleLabel: "Primeros auxilios", phone: "+54 9 11 5000 0002", isEmergency: true, sortOrder: 1 },
      { eventId: event.id, name: "Responsable Plaza San Martín", roleLabel: "Punto 2", phone: "+54 9 11 5000 0003", checkpointId: cps[1].id, sortOrder: 2 },
    ],
  });

  // Acceso de peregrinos: se muestra UNA vez (en BD solo queda el hash)
  const base = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  console.log("\nAcceso de peregrinos (enlace · código):");
  for (const p of parts) {
    const token = newAccessToken(), code = newAccessCode();
    await prisma.participant.update({ where: { id: p.id }, data: { accessTokenHash: hashAccess(token), accessCodeHash: hashAccess(code), accessIssuedAt: new Date() } });
    console.log(`  #${p.number} ${p.firstName}: ${base}/p/${token}  ·  ${formatCode(code)}`);
  }

  console.log("\nSeed listo. Usuarios (contraseña: %s):", PASSWORD);
  console.log("  superadmin@peregrinos.local · admin@peregrinos.local");
  console.log("  carlos@ · maria.operadora@ · juan.operador@ · laura.altas@ (con altas) — todos @peregrinos.local\n");
}

main().finally(() => prisma.$disconnect());
