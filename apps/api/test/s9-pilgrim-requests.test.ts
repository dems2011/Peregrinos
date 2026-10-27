/**
 * S9 — Solicitudes de los fieles a su parroquia, que SIGyP recoge y responde (2026-10-27). Sin base de datos: contrato,
 * reglas sobre la fuente (cursor en orden, organización de la credencial, datos que salen y que no) y migración. El flujo
 * contra una base real está en .e2e-local/e2e-solicitudes.mjs y, con SIGyP, en la suite x1.
 */
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-0123";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PILGRIM_REQUEST_STATUSES, SIGYP_DEFAULT_SCOPES, SIGYP_SCOPE_LABEL, pilgrimRequestCreateSchema, sigypRequestStatusSchema, sigypRequestTypeSchema } from "@peregrinos/shared";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const type = { contract: 1, sourceId: randomUUID(), version: 1, name: "Bautismo", description: "Traer la partida de nacimiento.", status: "ACTIVE" };
const status = { contract: 1, sourceId: randomUUID(), version: 2, status: "APPROVED", number: "PAR-SO-000012", message: "Te esperamos el sábado." };

describe("S9: contrato", () => {
  it("tipo de trámite: estricto, solo nombre y descripción pública; ACTIVE o WITHDRAWN", () => {
    assert.equal(sigypRequestTypeSchema.safeParse(type).success, true);
    assert.equal(sigypRequestTypeSchema.safeParse({ ...type, status: "WITHDRAWN" }).success, true);
    for (const extra of [{ requiresApproval: true }, { organizationId: randomUUID() }]) assert.equal(sigypRequestTypeSchema.safeParse({ ...type, ...extra }).success, false);
    assert.equal(sigypRequestTypeSchema.safeParse({ ...type, name: "ab" }).success, false);
  });
  it("estado: SIGyP nunca vuelve a «Enviada»; sin notas internas ni responsable; mensaje con tope", () => {
    assert.equal(sigypRequestStatusSchema.safeParse(status).success, true);
    assert.equal(sigypRequestStatusSchema.safeParse({ ...status, status: "SENT" }).success, false);
    for (const extra of [{ note: "interna" }, { assignedTo: "Ana" }, { requesterName: "x" }]) assert.equal(sigypRequestStatusSchema.safeParse({ ...status, ...extra }).success, false);
    assert.equal(sigypRequestStatusSchema.safeParse({ ...status, message: "x".repeat(501) }).success, false);
    assert.deepEqual([...PILGRIM_REQUEST_STATUSES].slice(1).sort(), ["APPROVED", "CANCELLED", "CLOSED", "IN_PROGRESS", "PENDING_APPROVAL", "RECEIVED", "REJECTED"]);
  });
  it("lo que pide el fiel: descripción 10–2000, teléfono opcional con formato; nada de nombre ni correo (salen de la cuenta)", () => {
    const ok = { organizationId: randomUUID(), typeId: randomUUID(), description: "Quiero bautizar a mi hija." };
    assert.equal(pilgrimRequestCreateSchema.safeParse(ok).success, true);
    assert.equal(pilgrimRequestCreateSchema.safeParse({ ...ok, description: "corto" }).success, false);
    assert.equal(pilgrimRequestCreateSchema.safeParse({ ...ok, phone: "<script>" }).success, false);
    assert.equal(pilgrimRequestCreateSchema.safeParse({ ...ok, requesterName: "Otro" }).success, false);
    assert.equal(pilgrimRequestCreateSchema.safeParse({ ...ok, userId: randomUUID() }).success, false);
  });
  it("alcance requests:sync: propuesto por defecto y explicado (incluye qué datos se comparten)", () => {
    assert.ok(SIGYP_DEFAULT_SCOPES.includes("requests:sync"));
    assert.match(SIGYP_SCOPE_LABEL["requests:sync"], /nombre, contacto y descripción/);
  });
});

describe("S9: reglas en la fuente", () => {
  const pr = read("src/routes/pilgrimRequests.ts");
  const sig = read("src/routes/sigypIntegration.ts");
  const turns = read("src/routes/organizationTurns.ts");
  it("pedir: cuenta del peregrino con correo verificado, organización que recibe (credencial vigente con requests:sync), tipo ACTIVO de ESA organización", () => {
    const post = pr.slice(pr.indexOf('app.post("/"'));
    assert.match(post, /app\.authenticatePilgrimAccount/);
    assert.match(post, /emailVerifiedAt/);
    assert.match(post, /REQUESTS_NOT_ACCEPTED/);
    assert.match(pr, /revokedAt: null, scopes: \{ has: "requests:sync" \}, organization: \{ status: "APPROVED" \}/);
    assert.match(post, /where: \{ id: b\.typeId, organizationId: b\.organizationId, active: true \}/);
    assert.match(post, /rateLimit: \{ max: 10, timeWindow: "1 hour" \}/);
    assert.match(post, /TOO_MANY_OPEN_REQUESTS/);
  });
  it("cursor en orden: altas de solicitudes y de decisiones de turnos en fila por organización (bloqueo de transacción)", () => {
    const post = pr.slice(pr.indexOf('app.post("/"'));
    assert.ok(post.indexOf('lockCursor(tx, "pilgrim-request"') < post.indexOf("tx.pilgrimRequest.create("));
    const d = turns.slice(turns.indexOf('app.post("/:id/decision"'));
    assert.ok(d.indexOf('lockCursor(tx, "pastoral-turn-decision"') < d.indexOf("tx.pastoralTurnDecision.create("));
    assert.match(read("src/lib/integrationLimits.ts"), /pg_advisory_xact_lock\(hashtext\(/);
  });
  it("cada persona ve solo las suyas; la auditoría no guarda la descripción", () => {
    assert.match(pr.slice(pr.indexOf('app.get("/"'), pr.indexOf('app.post("/"')), /where: \{ userId: req\.pilgrimAccount\.id \}/);
    const audit = pr.slice(pr.indexOf('action: "PILGRIM_REQUEST_CREATED"'));
    assert.ok(!/description/.test(audit.slice(0, audit.indexOf("});"))));
  });
  it("SIGyP: todo con requests:sync y la organización de la credencial; estado con versión creciente; push genérico DESPUÉS", () => {
    const block = sig.slice(sig.indexOf('app.put("/request-types/:sourceId"'), sig.indexOf("/* ---------- Avisos multigrupo"));
    assert.equal((block.match(/client\(req, "requests:sync"\)/g) ?? []).length, 3);
    assert.match(block, /where: \{ organizationId: c\.organizationId, seq: \{ gt: q\.after \} \}/);
    assert.match(block, /where: \{ id: sourceId, organizationId: c\.organizationId \}/);
    assert.match(block, /statusVersion: \{ lt: v\.version \}/);
    const st = block.slice(block.indexOf('app.put("/requests/:sourceId/status"'));
    assert.ok(st.indexOf("prisma.$transaction(") < st.indexOf("void pushNotification("), "push después de confirmar");
    assert.match(st, /title: "Novedades sobre tu solicitud"/);
    assert.ok(!/typeName|v\.message/.test(st.slice(st.indexOf("title:"), st.indexOf("recipients:"))), "el aviso (y el push) no lleva el trámite ni el mensaje");
  });
  it("migración 31 aditiva con CHECK y reversión que se aborta si hay datos", () => {
    const m = read("prisma/migrations/20261027000100_pilgrim_requests/migration.sql");
    assert.ok(!/^\s*(DROP|DELETE FROM|TRUNCATE|UPDATE)\b|ALTER COLUMN|DROP (TABLE|COLUMN|CONSTRAINT)/im.test(m.replace(/^--.*$/gm, "")), "aditiva");
    for (const c of ["PilgrimRequest_status_check", "PilgrimRequest_version_check", "PilgrimRequest_text_check", "ParishRequestType_source_check"]) assert.match(m, new RegExp(c));
    assert.match(read("prisma/rollback/20261027_pilgrim_requests_rollback.sql"), /RAISE EXCEPTION 'Reversión abortada/);
  });
});
