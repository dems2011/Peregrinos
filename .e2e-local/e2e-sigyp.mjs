// E2E SIGyP ↔ Peregrinos (ambos locales). Uso: GP_TEST_DATABASE_URL=… bash .e2e-local/run.sh e2e-sigyp.mjs api-sigyp.log
// 1) Datos de prueba en la base EN MEMORIA de Peregrinos (seguidores, uno de ellos también ADMIN).
// 2) Ejecuta la suite x1 de SIGyP (base gp_test) contra esta API (127.0.0.1:4555).
// 3) Verifica en la base de Peregrinos: destinatarios únicos, credencial revocada, eventos solo en su organización.
import { spawn } from "node:child_process";
import { prisma } from "./db.mjs";
import { check, client, done, mailLink, tokenFrom } from "./lib.mjs";

const SIGYP_API = "C:/Proyectos/GestionParroquial/apps/api";
if (!process.env.GP_TEST_DATABASE_URL) { console.log("Falta GP_TEST_DATABASE_URL (base de pruebas de SIGyP)."); process.exit(2); }

const orgA = await prisma.organization.findFirstOrThrow({ where: { name: "Organización Demo" } });
const orgB = await prisma.organization.findFirstOrThrow({ where: { name: "Organización B" } });
const adminA = await prisma.user.findUniqueOrThrow({ where: { email: "admin@peregrinos.local" } });
// Seguidores reales: cuenta de peregrino registrada y verificada por la API, que sigue la parroquia por la API.
const PWD = "una-clave-segura-1";
async function follower(email, doc, orgId) {
  const c = client();
  const r = await c.post("/auth/register-pilgrim", { firstName: "Seguidor", lastName: "Prueba", email, documentNumber: doc, phone: "1155554444", password: PWD, acceptTerms: true });
  if (r.status !== 202) throw new Error(`registro ${email}: ${r.status}`);
  const link = await mailLink(email, "verificar-email?token=");
  await c.get(`/auth/verify-email?token=${encodeURIComponent(tokenFrom(link))}`);
  if ((await c.post("/auth/account/login", { email, password: PWD })).status !== 200) throw new Error(`login ${email}`);
  const f = await c.post("/auth/account/follows", { organizationId: orgId });
  if (f.status !== 201) throw new Error(`seguir ${email}: ${f.status}`);
  return prisma.user.findUniqueOrThrow({ where: { email } });
}
await follower("seguidor1@test.local", "30111001", orgA.id);
await follower("seguidor2@test.local", "30111002", orgA.id);
// Un seguidor de B: un aviso de A nunca debe llegarle.
const followerB = await follower("seguidor.b@test.local", "30111003", orgB.id);
// SOLO para probar la deduplicación: en el producto una cuenta de personal no sigue parroquias (cuentas separadas),
// así que los grupos no se solapan; aquí se fuerza el solape del ADMIN con los seguidores directamente en la base.
await prisma.parishFollower.create({ data: { organizationId: orgA.id, userId: adminA.id } });
console.log("— Datos de prueba listos");

const cfg = { base: "http://127.0.0.1:4555", password: "Peregrinos2026!", superA: "superadmin@peregrinos.local", superB: "superadmin.b@peregrinos.local", adminA: "admin@peregrinos.local", orgA: orgA.id, orgB: orgB.id };
const out = await new Promise((ok) => {
  const p = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "test/x1-peregrinos-e2e.test.ts"], { cwd: SIGYP_API, env: { ...process.env, PEREGRINOS_E2E: JSON.stringify(cfg), DATABASE_URL: "" } });
  let s = "";
  p.stdout.on("data", (d) => { s += d; });
  p.stderr.on("data", (d) => { s += d; });
  p.on("exit", (code) => ok({ code, s }));
});
const clean = out.s.replace(/postgres(ql)?:\/\/\S*/g, "<url-oculta>");
console.log(clean.split("\n").filter((l) => /^\s*(✔|✖|﹣|ℹ (tests|pass|fail|skipped))|AssertionError|Error:|!==|expected|actual|x1-peregrinos-e2e\.test\.ts:\d+/.test(l)).join("\n"));
check("suite x1 de SIGyP aprobada", out.code === 0);

console.log("— Verificación en la base de Peregrinos");
const ids = JSON.parse((clean.match(/X1_NOTICES (\{.*\})/) ?? [, "{}"])[1]);
const notice = (sourceId) => prisma.notification.findUnique({ where: { organizationId_sourceSystem_sourceId: { organizationId: orgA.id, sourceSystem: "SIGYP", sourceId } }, include: { recipients: true } });
const nf = ids.followers && await notice(ids.followers);
const na = ids.admins && await notice(ids.admins);
const nm = ids.multi && await notice(ids.multi);
check("aviso a seguidores: 3 destinatarios (los 2 peregrinos y el ADMIN que sigue la parroquia)", nf?.recipients.length === 3 && nf.recipientCount === 3, nf && { n: nf.recipients.length });
check("aviso a administración: solo el ADMIN", na?.recipients.length === 1 && na.recipients[0].userId === adminA.id, na && { n: na.recipients.length });
check("varios grupos: el ADMIN (en dos grupos) recibe UNA vez → 3 únicos", nm?.recipients.length === 3 && new Set(nm.recipients.map((r) => r.userId)).size === 3, nm && { n: nm.recipients.length });
check("entrega INBOX (sin push en pruebas)", [nf, na, nm].every((n) => n?.delivery === "INBOX"));
check("el seguidor de B no recibe avisos de A", (await prisma.notificationRecipient.count({ where: { userId: followerB.id } })) === 0);
check("ningún aviso SIGyP creado en la organización B", (await prisma.notification.count({ where: { organizationId: orgB.id, sourceSystem: "SIGYP" } })) === 0);
check("sin avisos duplicados por reintento (uno por origen)", (await prisma.notification.count({ where: { organizationId: orgA.id, sourceSystem: "SIGYP" } })) === 3);
const clientsA = await prisma.integrationClient.findMany({ where: { organizationId: orgA.id }, orderBy: { createdAt: "asc" } });
check("credenciales de A: la primera revocada, la nueva vigente", clientsA.length === 2 && !!clientsA[0].revokedAt && !clientsA[1].revokedAt, clientsA.map((c) => !!c.revokedAt));
const codes = await prisma.integrationLinkCode.findMany({ where: { organizationId: orgA.id } });
check("códigos de vinculación usados una sola vez (los usados tienen usedAt; ninguno reutilizado)", codes.filter((c) => c.usedAt).length === 2, codes.map((c) => !!c.usedAt));
const evA = await prisma.event.findMany({ where: { organizationId: orgA.id, sourceSystem: "SIGYP" } });
const evB = await prisma.event.count({ where: { organizationId: orgB.id, sourceSystem: "SIGYP" } });
check("eventos SIGyP: 2 en A (uno cancelado, uno vigente), ninguno en B", evA.length === 2 && evA.filter((e) => e.status === "CANCELLED").length === 1 && evB === 0, { a: evA.map((e) => e.status), b: evB });
check("perfil de A administrado por SIGyP", (await prisma.organization.findUniqueOrThrow({ where: { id: orgA.id } })).profileSource === "SIGYP");
const audits = await prisma.auditLog.findMany({ where: { organizationId: orgA.id, action: { startsWith: "SIGYP_" } }, select: { action: true } }).catch(() => null);
if (audits) check("auditoría de Peregrinos registra la integración", audits.some((x) => x.action === "SIGYP_NOTICE_SENT") && audits.some((x) => x.action.startsWith("SIGYP_LINK")), [...new Set(audits.map((x) => x.action))]);
// D1–D3 (2026-10-26): lo que la suite x1 ejercitó contra esta API real.
const clientsB = await prisma.integrationClient.findMany({ where: { organizationId: orgB.id } });
check("D2: la credencial de B tiene exactamente los alcances elegidos (sin notices:staff)", clientsB.length === 1 && !clientsB[0].scopes.includes("notices:staff") && clientsB[0].scopes.includes("notices:send"), clientsB.map((c) => c.scopes));
check("D2: la credencial vigente de A incluye el personal (concedido por el titular)", clientsA.find((c) => !c.revokedAt)?.scopes.includes("notices:staff"));
check("D3: el aviso directo al personal con la credencial de B quedó rechazado y auditado", (await prisma.auditLog.count({ where: { organizationId: orgB.id, action: "SIGYP_NOTICE_DENIED" } })) === 1);
check("D3: ningún aviso SIGyP al personal en B", (await prisma.notification.count({ where: { organizationId: orgB.id } })) === 0);
check("D1: los intentos con contraseña incorrecta en Peregrinos quedaron auditados (REAUTH_FAILED)", (await prisma.auditLog.count({ where: { action: "REAUTH_FAILED" } })) >= 1);
// El ADMIN de la semilla no tiene parish:profile: lo frena el permiso antes que la regla del SUPERADMIN (el caso con
// parish:profile concedido, auditado como SIGYP_GRANT_DENIED, está en e2e-sigyp-seguridad.mjs).
// Turnos del sacerdote (2026-10-27): lo que la suite x1 decidió en este Peregrinos real.
const turns = JSON.parse((clean.match(/X1_TURNS (\{.*\})/) ?? [, "{}"])[1]);
const pt = turns.t1 ? await prisma.pastoralTurn.findMany({ where: { organizationId: orgA.id, sourceId: { in: [turns.t1, turns.t2] } }, include: { decisions: true } }) : [];
const t1 = pt.find((t) => t.sourceId === turns.t1), t2 = pt.find((t) => t.sourceId === turns.t2);
check("turnos: llegaron 2 turnos SIGyP a A, ninguno a B", pt.length === 2 && (await prisma.pastoralTurn.count({ where: { organizationId: orgB.id } })) === 0);
check("turnos: decisiones simultáneas → UNA sola decisión guardada para el primero", t1?.decisions.length === 1 && t1.status === turns.winner, t1 && { status: t1.status, n: t1.decisions.length });
check("turnos: el rechazo guarda su motivo y quién", t2?.status === "REJECTED" && t2.decisions.length === 1 && t2.reason === "Ese día celebro en otra capilla" && !!t2.decidedById);
check("turnos: auditados en Peregrinos (recibido y decidido)", (await prisma.auditLog.count({ where: { organizationId: orgA.id, action: "SIGYP_TURN_APPLIED" } })) >= 2
  && (await prisma.auditLog.count({ where: { organizationId: orgA.id, action: { in: ["TURN_ACCEPTED", "TURN_REJECTED"] }, entityId: { in: [t1?.id, t2?.id].filter(Boolean) } } })) === 2);
const turnNotices = await prisma.notification.findMany({ where: { organizationId: orgA.id, kind: "TURN_REQUEST" }, include: { recipients: true } });
check("turnos: aviso TURN_REQUEST por turno para quien decide (bandeja del personal)", turnNotices.length === 2 && turnNotices.every((n) => n.recipients.length >= 1));
check("turnos: push honesto sin FCM en pruebas (NOT_CONFIGURED, no se finge enviado)", pt.every((t) => t.pushStatus === "NOT_CONFIGURED"), pt.map((t) => t.pushStatus));
check("D2: el ADMIN no emitió ningún código ni credencial", (await prisma.integrationLinkCode.count({ where: { createdById: adminA.id } })) === 0 && (await prisma.integrationClient.count({ where: { createdById: adminA.id } })) === 0);
await prisma.$disconnect();
done("E2E SIGyP ↔ Peregrinos");
