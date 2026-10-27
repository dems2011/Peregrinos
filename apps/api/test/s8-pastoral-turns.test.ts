/**
 * S8 — Turnos que decide el sacerdote (2026-10-27). Sin base de datos: contrato, permisos, reglas sobre la fuente y el
 * push con un proveedor simulado (fallos, reintentos, sin configuración, sin dispositivos). El flujo contra una base
 * real está en .e2e-local/e2e-turnos.mjs y, con SIGyP, en la suite x1.
 */
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-0123";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { GRANTABLE_PERMISSIONS, ROLE_PERMISSIONS, SIGYP_DEFAULT_SCOPES, sigypTurnSchema, turnDecisionSchema } from "@peregrinos/shared";
import { pushTurnNotification } from "../src/lib/turns";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const turn = { contract: 1, sourceId: randomUUID(), version: 1, title: "Entrevista pastoral", category: "Entrevista", startsAt: "2026-11-02T13:00:00Z", endsAt: "2026-11-02T13:30:00Z", location: "Despacho parroquial", note: null, status: "PENDING" };

describe("S8: contrato del turno", () => {
  it("esquema estricto: sin datos de contacto ni campos de más; fin posterior al inicio", () => {
    assert.equal(sigypTurnSchema.safeParse(turn).success, true);
    for (const extra of [{ contactName: "Ana" }, { contactPhone: "11" }, { organizationId: randomUUID() }]) {
      assert.equal(sigypTurnSchema.safeParse({ ...turn, ...extra }).success, false, JSON.stringify(extra));
    }
    assert.equal(sigypTurnSchema.safeParse({ ...turn, endsAt: turn.startsAt }).success, false);
    assert.equal(sigypTurnSchema.safeParse({ ...turn, status: "ACCEPTED" }).success, false, "SIGyP no decide por el sacerdote");
    assert.equal(sigypTurnSchema.safeParse({ ...turn, note: "x".repeat(501) }).success, false);
  });
  it("decisión: aceptar sin motivo; rechazar exige motivo; siempre sobre una versión", () => {
    assert.equal(turnDecisionSchema.safeParse({ decision: "ACCEPTED", version: 1 }).success, true);
    assert.equal(turnDecisionSchema.safeParse({ decision: "REJECTED", version: 1 }).success, false);
    assert.equal(turnDecisionSchema.safeParse({ decision: "REJECTED", version: 1, reason: "Ese día celebro en otra capilla" }).success, true);
    assert.equal(turnDecisionSchema.safeParse({ decision: "ACCEPTED" }).success, false);
    assert.equal(turnDecisionSchema.safeParse({ decision: "MAYBE", version: 1 }).success, false);
  });
  it("permiso turn:decide: del titular, concedible; ADMIN y OPERATOR no lo tienen por su nivel; alcance turns:write propuesto", () => {
    assert.ok(ROLE_PERMISSIONS.SUPERADMIN.has("turn:decide"));
    assert.ok(!ROLE_PERMISSIONS.ADMIN.has("turn:decide") && !ROLE_PERMISSIONS.OPERATOR.has("turn:decide"));
    assert.ok((GRANTABLE_PERMISSIONS as readonly string[]).includes("turn:decide"));
    assert.ok(SIGYP_DEFAULT_SCOPES.includes("turns:write"));
  });
});

describe("S8: reglas en la fuente", () => {
  const org = read("src/routes/organizationTurns.ts");
  const sig = read("src/routes/sigypIntegration.ts");
  it("decidir: actualización condicional (PENDIENTE y misma versión) + registro con clave única + auditoría, en una transacción", () => {
    const d = org.slice(org.indexOf('app.post("/:id/decision"'));
    assert.match(d, /where: \{ id, organizationId: req\.auth\.organizationId, status: "PENDING", version: b\.version \}/);
    assert.ok(d.indexOf("prisma.$transaction(") < d.indexOf("tx.pastoralTurnDecision.create("));
    assert.match(d, /TURN_ALREADY_DECIDED/);
    assert.match(d, /TURN_CHANGED/);
    assert.match(d, /e\.code === "P2002"/);
    assert.match(d, /action: b\.decision === "ACCEPTED" \? "TURN_ACCEPTED" : "TURN_REJECTED"/);
    assert.match(read("prisma/schema.prisma"), /@@unique\(\[turnId, version\]\)/);
  });
  it("recibir de SIGyP: versión creciente, organización de la credencial, aviso en la transacción y push DESPUÉS", () => {
    const t = sig.slice(sig.indexOf('app.put("/turns/:sourceId"'), sig.indexOf('app.get("/turns/decisions"'));
    assert.match(t, /client\(req, "turns:write"\)/);
    assert.match(t, /versionOutcome\(cur\?\.version, v\.version\) === "stale"/);
    assert.match(t, /version: \{ lt: v\.version \}/);
    assert.ok(t.indexOf("notifyTurnDeciders(tx,") > 0 && t.indexOf("notifyTurnDeciders(tx,") < t.indexOf("void pushTurnNotification("));
    assert.ok(t.indexOf("void pushTurnNotification(") > t.indexOf("prisma.$transaction("), "el push no bloquea ni deshace la operación");
    const dec = sig.slice(sig.indexOf('app.get("/turns/decisions"'), sig.indexOf("/* ---------- Avisos multigrupo"));
    assert.match(dec, /where: \{ organizationId: c\.organizationId, seq: \{ gt: q\.after \} \}, orderBy: \{ seq: "asc" \}/);
  });
  it("la base garantiza la coherencia de la decisión", () => {
    const m = read("prisma/migrations/20261027000000_pastoral_turns/migration.sql");
    assert.match(m, /"PastoralTurn_decision_check"/);
    assert.match(m, /"status" <> 'REJECTED' OR "reason" IS NOT NULL/);
    assert.doesNotMatch(m, /^\s*(DELETE|UPDATE|DROP)\b/im);
  });
  it("el personal tiene bandeja y registro de teléfono propios (antes solo la cuenta del peregrino)", () => {
    const s = read("src/routes/staffInbox.ts");
    assert.match(s, /app\.get\("\/notifications", auth/);
    assert.match(s, /app\.post\("\/devices", limited\(30\)/);
    assert.match(s, /where: \{ userId \}/);
    assert.match(read("src/app.ts"), /register\(staffInboxRoutes, \{ prefix: "\/api\/staff" \}\)/);
  });
});

describe("S8: push del turno con un proveedor simulado", () => {
  const n = { id: randomUUID(), organizationId: randomUUID(), eventId: null, title: "Turno para decidir", body: "Lunes 10 h" };
  const fast = { delaysMs: [1, 1] };
  it("sin FCM configurado: NOT_CONFIGURED en un intento (no se finge un envío)", async () => {
    assert.deepEqual(await pushTurnNotification(randomUUID(), n, { ...fast, sender: async () => null }), { status: "NOT_CONFIGURED", attempts: 1 });
  });
  it("sin teléfonos registrados: NO_DEVICES sin reintentar", async () => {
    assert.deepEqual(await pushTurnNotification(randomUUID(), n, { ...fast, sender: async () => ({ sent: 0, failed: 0, invalid: [] }) }), { status: "NO_DEVICES", attempts: 1 });
  });
  it("envío correcto: SENT; lleva el destino «turns» para abrir la pantalla de turnos", async () => {
    let data: Record<string, string> | undefined;
    const r = await pushTurnNotification(randomUUID(), n, { ...fast, sender: async (x) => { data = x.extraData; return { sent: 1, failed: 0, invalid: [] }; } });
    assert.deepEqual(r, { status: "SENT", attempts: 1 });
    assert.equal(data?.target, "turns");
  });
  it("el proveedor falla dos veces y luego responde: se reintenta y queda SENT en el tercer intento", async () => {
    let calls = 0;
    const r = await pushTurnNotification(randomUUID(), n, { ...fast, sender: async () => (++calls < 3 ? { sent: 0, failed: 1, invalid: [] } : { sent: 1, failed: 0, invalid: [] }) });
    assert.deepEqual(r, { status: "SENT", attempts: 3 });
  });
  it("el proveedor falla siempre (o lanza): FAILED tras 3 intentos; nunca lanza hacia quien llama", async () => {
    let calls = 0;
    assert.deepEqual(await pushTurnNotification(randomUUID(), n, { ...fast, sender: async () => { calls++; return { sent: 0, failed: 2, invalid: [] }; } }), { status: "FAILED", attempts: 3 });
    assert.equal(calls, 3);
    assert.deepEqual(await pushTurnNotification(randomUUID(), n, { ...fast, sender: async () => { throw new Error("FCM caído"); } }), { status: "FAILED", attempts: 3 });
  });
  it("un fallo final queda auditado (TURN_PUSH_FAILED) y el resultado se guarda en el turno", () => {
    const l = read("src/lib/turns.ts");
    assert.match(l, /data: \{ pushStatus: status, pushAttempts: \{ increment: attempts \} \}/);
    assert.match(l, /action: "TURN_PUSH_FAILED"/);
  });
});
