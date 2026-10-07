/**
 * A4a — Person (identidad humana) ≠ User (cuenta) ≠ Participant ≠ Registration. Tests sin base de datos.
 * La migración sobre datos heredados y el E2E se ejecutan contra PostgreSQL local (PGlite).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GRANTABLE_PERMISSIONS, claimPersonSchema, createParticipantSchema, createPersonSchema, mergePersonSchema, registerPilgrimSchema, updatePersonSchema,
} from "@peregrinos/shared";
import { assertEditableBy, personData, personScope, personView, personVisibleWhere } from "../src/lib/persons";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const MIG = "prisma/migrations/20261009000000_person_identity/migration.sql";

describe("A4a: esquemas", () => {
  it("una persona sin tecnología: solo el nombre es obligatorio (sin correo, teléfono ni documento)", () => {
    assert.equal(createPersonSchema.safeParse({ firstName: "Juan" }).success, true);
    assert.equal(createPersonSchema.safeParse({}).success, false);
  });
  it("estricto: no acepta campos de cuenta ni de autorización", () => {
    for (const extra of [{ userId: "x" }, { accountType: "PILGRIM" }, { role: "SUPERADMIN" }, { organizationId: "x" }, { ownerOrganizationId: "x" }, { mergedIntoId: "x" }]) {
      assert.equal(createPersonSchema.safeParse({ firstName: "Juan", ...extra }).success, false, JSON.stringify(extra));
      assert.equal(updatePersonSchema.safeParse({ ...extra }).success, false, JSON.stringify(extra));
    }
  });
  it("documento y teléfono se validan si se informan; fecha de nacimiento no futura", () => {
    assert.equal(createPersonSchema.safeParse({ firstName: "A", documentNumber: "12" }).success, false);
    assert.equal(createPersonSchema.safeParse({ firstName: "A", phone: "12" }).success, false);
    assert.equal(createPersonSchema.safeParse({ firstName: "A", birthDate: "2999-01-01" }).success, false);
    assert.equal(createPersonSchema.safeParse({ firstName: "A", documentNumber: "30.111.222", phone: "+54 11 5555 4444", birthDate: "1990-05-01" }).success, true);
  });
  it("confirmar una persona nueva pese a coincidencias exige true explícito", () => {
    assert.equal(createPersonSchema.safeParse({ firstName: "A", confirmNewPerson: false }).success, false);
    assert.equal(createParticipantSchema.safeParse({ firstName: "A", lastName: "B", documentNumber: "30111222", phone: "1155554444", confirmNewPerson: true }).success, true);
  });
  it("fusión explícita: exige confirm: true", () => {
    assert.equal(mergePersonSchema.safeParse({ intoPersonId: "8b0a5a0e-6c6c-4b6b-9c8d-111111111111" }).success, false);
    assert.equal(mergePersonSchema.safeParse({ intoPersonId: "8b0a5a0e-6c6c-4b6b-9c8d-111111111111", confirm: true }).success, true);
  });
  it("registro PILGRIM: sin código de vinculación (el canje es posterior, con email verificado); sigue estricto", () => {
    const base = { firstName: "Ana", lastName: "Paz", email: "a@b.cd", documentNumber: "30111222", phone: "1155554444", password: "una-clave-segura", acceptTerms: true };
    assert.equal(registerPilgrimSchema.safeParse(base).success, true);
    assert.equal(registerPilgrimSchema.safeParse({ ...base, claimCode: "ABCDE-FGHJK" }).success, false);
    for (const extra of [{ role: "ADMIN" }, { organizationId: "x" }, { accountType: "STAFF" }, { personId: "x" }]) {
      assert.equal(registerPilgrimSchema.safeParse({ ...base, ...extra }).success, false, JSON.stringify(extra));
    }
    assert.equal(claimPersonSchema.safeParse({ code: "ABCDE-FGHJK" }).success, false); // exige confirmación explícita
    assert.equal(claimPersonSchema.safeParse({ code: "ABCDE-FGHJK", confirm: true }).success, true);
  });
});

describe("A4a: reglas de Person", () => {
  it("personData normaliza documento y teléfono", () => {
    const d = personData({ firstName: "A", documentNumber: "30.111.222", phone: "+54 (11) 5555-4444" });
    assert.equal(d.documentNumber, "30111222");
    assert.equal(d.phoneDigits, "541155554444");
    assert.equal(personData({ firstName: "A" }).documentNumber, null);
  });
  it("identidad reclamada: el personal no la edita; otra organización tampoco", () => {
    assert.throws(() => assertEditableBy({ ownerOrganizationId: null, user: null }, "o1"), (e: { status?: number }) => e.status === 403);
    assert.throws(() => assertEditableBy({ ownerOrganizationId: "o1", user: { id: "u" } }, "o1"), (e: { code?: string }) => e.code === "PERSON_CLAIMED");
    assert.throws(() => assertEditableBy({ ownerOrganizationId: "o2", user: null }, "o1"), (e: { status?: number }) => e.status === 403);
    assert.doesNotThrow(() => assertEditableBy({ ownerOrganizationId: "o1", user: null }, "o1"));
  });
  it("el operador ve lo mínimo; nunca el hash del código de vinculación", () => {
    const p = { id: "p", firstName: "A", lastName: "B", documentType: "DNI", documentNumber: "1", phone: "1", email: "e@x.y", birthDate: null, ownerOrganizationId: "o", createdAt: new Date(), user: null, claimCodeHash: "h" } as never;
    assert.deepEqual(Object.keys(personView(p, "OPERATOR")).sort(), ["claimed", "documentNumber", "firstName", "id", "lastName", "phone"]);
    assert.ok(!("claimCodeHash" in personView(p, "SUPERADMIN")));
  });
});

describe("A4a: modelo y migración", () => {
  const schema = read("prisma/schema.prisma");
  const m = read(MIG);
  it("Person → User = 0..1: User.personId es único (BD)", () => {
    assert.match(schema, /personId\s+String\?\s+@unique/);
    assert.match(m, /CREATE UNIQUE INDEX "User_personId_key" ON "User"\("personId"\)/);
  });
  it("Participant y Registration pertenecen a una Person (NOT NULL) y no exigen cuenta (userId opcional)", () => {
    assert.match(m, /ALTER TABLE "Participant" ALTER COLUMN "personId" SET NOT NULL/);
    assert.match(m, /ALTER TABLE "Registration" ALTER COLUMN "personId" SET NOT NULL/);
    assert.match(schema, /model Participant \{[\s\S]*?userId\s+String\?[\s\S]*?personId\s+String\n/);
    assert.match(m, /CREATE UNIQUE INDEX "Participant_eventId_personId_key"/);
    assert.match(m, /CREATE UNIQUE INDEX "Registration_eventId_personId_key"/);
  });
  it("CHECKs: PILGRIM tiene Person; sin auto-fusión; código con vencimiento", () => {
    for (const c of ["User_pilgrim_has_person", "Person_not_merged_into_itself", "Person_claim_code_valid"]) assert.match(m, new RegExp(`"${c}"`), c);
  });
  it("conservadora: sin DELETE/TRUNCATE/DROP; los UPDATE solo completan personId", () => {
    assert.doesNotMatch(m, /^\s*(DELETE|TRUNCATE)\b/im);
    assert.doesNotMatch(m, /\bDROP\b/i);
    const updates = m.match(/^\s*UPDATE\b[^;]*;/gim) ?? [];
    assert.ok(updates.length >= 5);
    for (const u of updates) assert.match(u, /SET "personId" =/, u);
  });
  it("FK RESTRICT: una persona con historial nunca se borra", () => {
    for (const fk of ["User_personId_fkey", "Participant_personId_fkey", "Registration_personId_fkey"]) {
      assert.match(m, new RegExp(`"${fk}" FOREIGN KEY \\("personId"\\) REFERENCES "Person"\\("id"\\) ON DELETE RESTRICT`));
    }
  });
});

describe("A4a: el código usa Person (no User) como identidad", () => {
  it("registro público: sin cuenta crea su Person de la organización; con cuenta usa la Person de la sesión (B1)", () => {
    const reg = read("src/routes/registration.ts");
    assert.match(reg, /person: account\s*\?\s*\{ connect: \{ id: account\.personId \} \}\s*:\s*\{\s*create: \{[\s\S]*?ownerOrganization: \{ connect: \{ id: event\.organizationId \} \}/);
    // La cuenta sale SOLO de la sesión autenticada (nunca de coincidencias de documento o correo).
    assert.match(reg, /await app\.authenticatePilgrimAccount\(req, reply\)/);
  });
  it("aprobar: el Participant hereda la Person de la inscripción", () => assert.match(read("src/routes/registrations.ts"), /personId: reg\.personId/));
  it("alta manual: elige o crea Person con confirmación de duplicados", () => assert.match(read("src/routes/participants.ts"), /resolvePersonForParticipation\(tx, personScope\(req\.auth\), body\)/));
  it("registro PILGRIM: siempre crea su Person; nunca reclama ni vincula por coincidencia", () => {
    const s = read("src/routes/auth.ts");
    const reg = s.slice(s.indexOf('"/register-pilgrim"'), s.indexOf('"/account/claim-person"'));
    assert.match(reg, /const personId = \(await tx\.person\.create\(/);
    assert.match(reg, /accountType: "PILGRIM",[\s\S]*?personId,/);
    assert.doesNotMatch(reg, /claimCode|claimPersonForUser/);
    assert.doesNotMatch(s, /person\.findFirst\(\{\s*where: \{ documentNumber/);
  });
  it("la cuenta del peregrino lee la identidad desde Person", () => assert.match(read("src/lib/session.ts"), /documentNumber: user\.person\?\.documentNumber \?\? user\.documentNumber/));
  it("sin permisos nuevos: rutas de Person con permisos existentes; nada nuevo concedible", () => {
    const s = read("src/routes/persons.ts");
    const perms = [...s.matchAll(/requirePermission\("([^"]+)"\)/g)].map((x) => x[1]);
    assert.deepEqual([...new Set(perms)].sort(), ["participant:create", "participant:manage", "participant:read"]);
    assert.deepEqual([...GRANTABLE_PERMISSIONS], ["participant:create", "checkin:read", "report:read"]);
  });
  it("canje (A5.0): une el registro de UNA organización a la identidad global; atómico, un solo uso, nunca cambia User.personId", () => {
    const s = read("src/lib/persons.ts");
    const claim = s.slice(s.indexOf("export async function claimPersonForUser"), s.indexOf("export async function unlinkAccount"));
    assert.match(claim, /updateMany\(\{\s*where: \{ id: source\.id, claimCodeHash: hash, claimCodeExpiresAt: \{ gt: new Date\(\) \}, mergedIntoId: null \},\s*data: \{ claimCodeHash: null, claimCodeExpiresAt: null, mergedIntoId: globalId \}/);
    assert.doesNotMatch(claim, /tx\.user\.update|mergePersons/); // la cuenta nunca cambia de Person
    assert.match(claim, /assertNoEventClash\(tx, source\.id, globalId\)/); // conflictos antes de mover
    assert.match(claim, /tx\.personClaim\.create\(/); // registra exactamente qué se movió
    assert.doesNotMatch(claim, /ACCOUNT_PERSON_HAS_HISTORY/); // el historial propio ya no bloquea (cuenta global)
    assert.match(claim, /user\.accountType !== "PILGRIM" \|\| !user\.isActive\) \{\s*throw new AppError\(403, "ACCOUNT_INACTIVE"/);
    assert.match(claim, /if \(!user\.emailVerifiedAt\) \{\s*throw new AppError\(403, "ACCOUNT_NOT_VERIFIED"/);
  });
  it("desvinculación (A5.0): solo la organización emisora revierte SUS uniones; la cuenta no cambia; con motivo y auditada", () => {
    const lib = read("src/lib/persons.ts"), routes = read("src/routes/persons.ts");
    const unlink = lib.slice(lib.indexOf("export async function unlinkAccount"));
    assert.match(unlink, /personClaim\.findMany\(\{ where: \{ personId, organizationId: scope\.organizationId, reversedAt: null \} \}\)/);
    assert.match(unlink, /source\.ownerOrganizationId !== scope\.organizationId \|\| source\.mergedIntoId !== personId/);
    assert.match(unlink, /where: \{ id: \{ in: c\.movedParticipantIds \}, personId \}/);
    assert.doesNotMatch(unlink, /tx\.user\.update/);
    // A6: además exige step-up (segundo factor reciente) a las cuentas con MFA.
    assert.match(routes, /"\/:id\/unlink-account", \{ preHandler: \[app\.requirePermission\("participant:manage"\), app\.requireRecentMfa\] \}/);
    assert.match(routes, /auditTx\(tx, req, \{ action: "PERSON_ACCOUNT_UNLINKED"/);
  });
  it("reabrir inscripción rechazada: payment:review, motivo, condicional y auditada; aprobar sigue exigiendo IN_REVIEW", () => {
    const s = read("src/routes/registrations.ts");
    assert.match(s, /app\.post\("\/:id\/reopen", \{ preHandler: review \}/);
    assert.match(s, /where: \{ id, eventId, status: "REJECTED" \},\s*data: \{ status: "IN_REVIEW"/);
    assert.match(s, /auditTx\(tx, req, \{ action: "REGISTRATION_REOPENED"/);
    assert.match(s, /if \(reg\.status === "REJECTED"\) \{\s*throw new AppError\(409, "REGISTRATION_REJECTED"/);
  });
});

describe("A4a: correcciones de la auditoría final", () => {
  it("el operador solo ve personas de sus eventos asignados (ni las propias de la organización sin participación)", () => {
    const op = personVisibleWhere({ organizationId: "o", operatorUserId: "u" }) as { OR: Record<string, unknown>[] };
    const staff = personVisibleWhere({ organizationId: "o" }) as { OR: Record<string, unknown>[] };
    assert.ok(!op.OR.some((c) => "ownerOrganizationId" in c));
    assert.ok(staff.OR.some((c) => "ownerOrganizationId" in c));
    assert.match(JSON.stringify(op), /"assignments":\{"some":\{"userId":"u"\}\}/);
    assert.deepEqual(personScope({ id: "u", role: "OPERATOR", organizationId: "o" }), { organizationId: "o", operatorUserId: "u" });
    assert.deepEqual(personScope({ id: "u", role: "ADMIN", organizationId: "o" }), { organizationId: "o" });
  });
  it("canje: filas bloqueadas (registro e identidad global) y consumo condicional del código", () => {
    const s = read("src/lib/persons.ts");
    assert.match(s, /await lockPersons\(tx, \[found\.id, globalId\]\)/);
    assert.match(s, /FOR UPDATE/);
  });
  it("fusión, canje y emisión de código: auditados en la misma transacción", () => {
    const routes = read("src/routes/persons.ts"), auth = read("src/routes/auth.ts");
    assert.match(routes, /auditTx\(tx, req, \{ action: "PERSON_MERGED"/);
    assert.match(routes, /auditTx\(tx, req, \{ action: "PERSON_CLAIM_CODE_ISSUED"/);
    assert.equal((auth.match(/auditTx\(tx, req, \{ action: "PERSON_CLAIMED"/g) ?? []).length, 1);
  });
  it("nunca queda un código activo sobre una persona reclamada o fusionada (emisión condicional)", () =>
    assert.match(read("src/routes/persons.ts"), /where: \{ id, ownerOrganizationId: req\.auth\.organizationId, mergedIntoId: null, user: \{ is: null \} \},\s*data: \{ claimCodeHash: claim\.hash/));
  it("cupo en todos los caminos que suman ACTIVE: aprobar, alta manual, importación y reactivación", () => {
    const parts = read("src/routes/participants.ts"), regs = read("src/routes/registrations.ts");
    assert.equal((parts.match(/assertCapacityFor\(tx, eventId, /g) ?? []).length, 3);
    assert.match(regs, /assertCapacityFor\(tx, eventId, 1\)/);
    assert.match(parts, /await lockEvent\(tx, eventId\);\s*const current = await tx\.participant\.findUniqueOrThrow/);
  });
  it("capacidades: el conteo de datos es exhaustivo sobre las implementadas (A5 deberá declarar las suyas)", () =>
    assert.match(read("src/lib/eventLifecycle.ts"), /const DATA: Record<ImplementedEventCapability,/));
});

describe("A4a: cierre (fusión explícita con cuenta, desvinculación, comprobante)", () => {
  const lib = read("src/lib/persons.ts");
  const merge = lib.slice(lib.indexOf("export async function mergePersons"), lib.indexOf("export function newClaimCode"));
  it("fusión: bloquea ambas Personas (orden determinístico) antes de leer", () => {
    assert.ok(merge.indexOf("await lockPersons(tx, [fromId, intoId])") < merge.indexOf("loadVisiblePerson"));
    assert.match(lib, /for \(const id of \[\.\.\.new Set\(ids\)\]\.sort\(\)\)/);
  });
  it("fusión: nunca dos cuentas; si solo el origen tiene cuenta, pasa al destino (condicional)", () => {
    assert.match(merge, /if \(from\.user && into\.user\) \{\s*throw new AppError\(409, "BOTH_HAVE_ACCOUNTS"/);
    assert.match(merge, /tx\.user\.updateMany\(\{ where: \{ id: from\.user\.id, personId: fromId \}, data: \{ personId: intoId \} \}\)/);
  });
  it("fusión: conflictos por evento se detectan ANTES de modificar nada", () => {
    assert.ok(merge.indexOf("assertNoEventClash(tx, fromId, intoId)") < merge.indexOf("participant.updateMany"));
    assert.ok(merge.indexOf("assertNoEventClash(tx, fromId, intoId)") < merge.indexOf("tx.user.updateMany"));
    assert.match(lib, /throw new AppError\(409, "PERSON_MERGE_CONFLICT"/);
  });
  it("fusión: origen marcado (no borrado) de forma condicional; sin DELETE", () => {
    assert.match(merge, /tx\.person\.updateMany\(\{ where: \{ id: fromId, mergedIntoId: null \}, data: \{ mergedIntoId: intoId/);
    assert.doesNotMatch(lib, /\.delete(Many)?\(/);
  });
  it("fusión: el origen siempre es un registro de esta organización (nunca una identidad global ajena)", () => {
    assert.match(merge, /if \(from\.ownerOrganizationId !== scope\.organizationId\) throw forbidden/);
    assert.doesNotMatch(lib, /loadMergeSource|previousPersonId/);
  });
  it("desvinculación: solo cuenta PILGRIM activa", () =>
    assert.match(lib, /account\.accountType !== "PILGRIM" \|\| !account\.isActive\) \{\s*throw new AppError\(409, "ACCOUNT_NOT_UNLINKABLE"/));
  it("comprobante del peregrino (→ IN_REVIEW): respeta ciclo de vida del evento y capacidad REGISTRATION", () => {
    const s = read("src/routes/pilgrim.ts");
    assert.match(s, /reg\.event\.status === "FINISHED" \|\| reg\.event\.status === "CANCELLED"\) throw new AppError\(409, "EVENT_CLOSED"/);
    assert.match(s, /assertEventCapability\(reg\.event, "REGISTRATION"\)/);
  });
});
