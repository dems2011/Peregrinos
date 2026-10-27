// E2E — turnos que decide el sacerdote (2026-10-27), contra la API y una base local. SIGyP se simula con su credencial
// (Bearer `turns:write`); el sacerdote decide por la API del panel. Sin FCM en el arnés: el push se informa como
// NOT_CONFIGURED (no se finge un envío). Uso: bash .e2e-local/run-pg.sh e2e-turnos.mjs api-turnos.log
import { randomUUID } from "node:crypto";
import { prisma } from "./db.mjs";
import { BASE, check, done, staff } from "./lib.mjs";

const SEED_PWD = "Peregrinos2026!";
const V1 = `${BASE}/integrations/sigyp/v1`;
const sig = async (method, url, token, body) => {
  const res = await fetch(V1 + url, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let json = null; try { json = t ? JSON.parse(t) : null; } catch { json = t; }
  return { status: res.status, body: json };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const orgA = await prisma.organization.findFirstOrThrow({ where: { name: "Organización Demo" } });
const sa = await staff("superadmin@peregrinos.local");
const saUser = await prisma.user.findUniqueOrThrow({ where: { email: "superadmin@peregrinos.local" } });
const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@peregrinos.local" } });
const cred = async (who, scopes) => (await who.post("/organization/integrations/sigyp", { label: "SIGyP turnos", scopes, password: SEED_PWD })).body.token;
const tok = await cred(sa, ["turns:write"]);
const tokNoTurns = await cred(sa, ["profile:write"]);
const saB = await staff("superadmin.b@peregrinos.local");
const tokB = await cred(saB, ["turns:write"]);
const T = (over = {}) => ({ contract: 1, sourceId: randomUUID(), version: 1, title: "Entrevista pastoral", category: "Entrevista", startsAt: "2026-11-02T13:00:00.000Z", endsAt: "2026-11-02T13:30:00.000Z", location: "Despacho", note: "Pedido por la secretaría", status: "PENDING", ...over });
const put = (t, token = tok) => sig("PUT", `/turns/${t.sourceId}`, token, t);
const turnRow = (sourceId) => prisma.pastoralTurn.findUnique({ where: { organizationId_sourceSystem_sourceId: { organizationId: orgA.id, sourceSystem: "SIGYP", sourceId } } });
const decide = (who, id, body) => who.post(`/organization/turns/${id}/decision`, body);

console.log("— Recepción desde SIGyP y aviso al sacerdote");
check("sin el alcance turns:write: 403", (await put(T(), tokNoTurns)).status === 403);
const t1 = T();
const r1 = await put(t1);
check("turno nuevo: aplicado y avisado al titular (1 destinatario)", r1.status === 200 && r1.body?.status === "applied" && r1.body?.notified === 1, r1.body);
const row1 = await turnRow(t1.sourceId);
check("guardado PENDIENTE en la organización de la credencial, sin datos de contacto", row1?.status === "PENDING" && row1.organizationId === orgA.id && !("contactPhone" in row1));
check("repetir la misma versión: stale, sin aviso nuevo", (await put(t1)).body?.status === "stale" && (await prisma.notification.count({ where: { organizationId: orgA.id, kind: "TURN_REQUEST" } })) === 1);
const inbox = await sa.get("/staff/notifications");
check("bandeja del titular: el aviso del turno, sin leer", inbox.status === 200 && inbox.body.unread >= 1 && inbox.body.items.some((n) => n.kind === "TURN_REQUEST" && !n.readAt), inbox.body?.unread);
check("indicador: 1 turno pendiente", (await sa.get("/organization/turns/summary")).body?.pending === 1);
for (let i = 0; i < 20 && !(await turnRow(t1.sourceId)).pushStatus; i++) await sleep(150);
check("push sin FCM configurado: NOT_CONFIGURED registrado (no se finge un envío)", (await turnRow(t1.sourceId)).pushStatus === "NOT_CONFIGURED");
check("auditoría SIGYP_TURN_APPLIED", (await prisma.auditLog.count({ where: { action: "SIGYP_TURN_APPLIED", entityId: row1.id } })) === 1);

console.log("— Permisos");
const admin = await staff("admin@peregrinos.local");
check("ADMIN sin turn:decide: no ve los turnos (403)", (await admin.get("/organization/turns")).status === 403);
check("ADMIN sin turn:decide: no decide (403)", (await decide(admin, row1.id, { decision: "ACCEPTED", version: 1 })).status === 403);
check("ADMIN no recibió el aviso del turno", (await prisma.notificationRecipient.count({ where: { userId: adminUser.id, notification: { kind: "TURN_REQUEST" } } })) === 0);

console.log("— Decidir: una sola vez, sobre la versión vigente");
check("rechazar sin motivo: 400", (await decide(sa, row1.id, { decision: "REJECTED", version: 1 })).status === 400);
const ok = await decide(sa, row1.id, { decision: "ACCEPTED", version: 1 });
check("aceptar: 200 con su número de decisión", ok.status === 200 && typeof ok.body?.seq === "number", ok.body);
const again = await decide(sa, row1.id, { decision: "REJECTED", version: 1, reason: "Cambié de opinión" });
check("segunda decisión: 409 TURN_ALREADY_DECIDED y no cambia nada", again.status === 409 && again.body?.error === "TURN_ALREADY_DECIDED" && (await turnRow(t1.sourceId)).status === "ACCEPTED", again.body);
check("auditoría TURN_ACCEPTED", (await prisma.auditLog.count({ where: { action: "TURN_ACCEPTED", entityId: row1.id, userId: saUser.id } })) === 1);

const t2 = T({ title: "Bendición de hogar" });
await put(t2);
const row2 = await turnRow(t2.sourceId);
const both = await Promise.all([decide(sa, row2.id, { decision: "ACCEPTED", version: 1 }), decide(sa, row2.id, { decision: "REJECTED", version: 1, reason: "No puedo ese día" })]);
check("dos decisiones simultáneas: una 200 y una 409", both.map((r) => r.status).sort().join() === "200,409", both.map((r) => r.status));
check("una sola fila de decisión para esa versión", (await prisma.pastoralTurnDecision.count({ where: { turnId: row2.id } })) === 1);

const t3 = T({ title: "Confesión" });
await put(t3);
const row3 = await turnRow(t3.sourceId);
check("SIGyP cambia el horario (versión 2): vuelve a avisar", (await put({ ...t3, version: 2, startsAt: "2026-11-03T13:00:00.000Z", endsAt: "2026-11-03T13:30:00.000Z" })).body?.notified === 1);
const stale = await decide(sa, row3.id, { decision: "ACCEPTED", version: 1 });
check("decidir sobre la versión vieja: 409 TURN_CHANGED", stale.status === 409 && stale.body?.error === "TURN_CHANGED", stale.body);
check("rechazar la versión vigente con motivo: 200", (await decide(sa, row3.id, { decision: "REJECTED", version: 2, reason: "Ese día celebro en otra capilla" })).status === 200);

const t4 = T({ title: "Retirado" });
await put(t4);
const row4 = await turnRow(t4.sourceId);
check("SIGyP retira el turno: WITHDRAWN", (await put({ ...t4, version: 2, status: "WITHDRAWN" })).body?.turnStatus === "WITHDRAWN");
check("decidir un turno retirado: 409", (await decide(sa, row4.id, { decision: "ACCEPTED", version: 2 })).status === 409);

const t5 = T({ title: "Reabierto" });
await put(t5);
const row5 = await turnRow(t5.sourceId);
await decide(sa, row5.id, { decision: "ACCEPTED", version: 1 });
await put({ ...t5, version: 2, location: "Templo" });
const r5 = await turnRow(t5.sourceId);
check("turno ya decidido que SIGyP modifica: vuelve a PENDIENTE y la decisión anterior queda en el registro", r5.status === "PENDING" && r5.decidedById === null && (await prisma.pastoralTurnDecision.count({ where: { turnId: row5.id } })) === 1);

console.log("— Lo que lee SIGyP (cursor)");
const all = await sig("GET", "/turns/decisions?after=0", tok);
const seqs = all.body?.items?.map((d) => d.seq) ?? [];
check("decisiones en orden con cursor creciente", all.status === 200 && seqs.length === 4 && seqs.every((s, i) => i === 0 || s > seqs[i - 1]), all.body);
check("cada decisión trae turno, versión, decisión, motivo y quién (sin otros datos)", Object.keys(all.body.items[0]).sort().join() === "decidedAt,decidedByName,decision,reason,seq,sourceId,version");
const rej = all.body.items.find((d) => d.sourceId === t3.sourceId);
check("el rechazo trae su motivo y la versión decidida", rej?.decision === "REJECTED" && rej.version === 2 && rej.reason === "Ese día celebro en otra capilla", rej);
check("desde el último cursor: nada nuevo", (await sig("GET", `/turns/decisions?after=${all.body.next}`, tok)).body.items.length === 0);
check("otra organización (B) no ve las decisiones de A", (await sig("GET", "/turns/decisions?after=0", tokB)).body.items.length === 0);
check("la credencial de B no puede tocar el turno de A (crea uno propio, aislado)", (await sig("PUT", `/turns/${t1.sourceId}`, tokB, { ...t1, version: 9 })).status === 200 && (await turnRow(t1.sourceId)).version === 1);

console.log("— Teléfono del personal (registro para push)");
const devTok = `fcm_${randomUUID().replace(/-/g, "")}_e2e_staff_device_token`;
check("el personal registra su teléfono (201)", (await sa.post("/staff/devices", { token: devTok })).status === 201);
check("queda a nombre del titular, activo", (await prisma.deviceToken.findUnique({ where: { token: devTok } }))?.userId === saUser.id);
check("baja al cerrar sesión", (await sa.req("DELETE", "/staff/devices", { token: devTok })).body?.revoked === true);
check("marcar los avisos como leídos", (await sa.post("/staff/notifications/read-all")).status === 200 && (await sa.get("/staff/notifications")).body.unread === 0);

await prisma.$disconnect();
done("E2E turnos del sacerdote");
