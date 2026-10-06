/**
 * A5.1 — Voluntariado entre organizaciones con consentimiento explícito (VolunteerConsentCode).
 * Flujo: la cuenta genera un código → una organización lo canjea para UN evento (solicitud, sin datos de la persona)
 * → la persona acepta (VolunteerParticipation con su Person existente) o rechaza.
 * Comportamiento probado sobre una transacción en memoria (sin base de datos); rutas, migración y esquemas sobre el
 * código fuente.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROLE_PERMISSIONS, VOLUNTEER_CONSENT_CODE_HOURS, createVolunteerSchema, volunteerConsentRequestSchema } from "@peregrinos/shared";
import {
  MAX_CONSENT_CODES_PER_HOUR, answerVolunteerRequest, consentRequestStatus, issueVolunteerConsentCode, requestVolunteerConsent,
} from "../src/lib/volunteerConsent";
import { formatCode, hashAccess } from "../src/lib/pilgrim";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/* ---------- Transacción en memoria: solo lo que usa lib/volunteerConsent ---------- */
type Row = Record<string, any>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("gt" in v) return row[k] instanceof Date && row[k] > v.gt;
      if ("not" in v) return row[k] !== v.not;
    }
    return row[k] === v;
  });
}
function fakeDb() {
  const users: Row[] = [], persons: Row[] = [], codes: Row[] = [], events: Row[] = [], volunteers: Row[] = [];
  let seq = 0, locks = 0;
  const tx = {
    $executeRaw: async () => { locks++; return 1; },
    user: { findUniqueOrThrow: async ({ where }: Row) => { const u = users.find((x) => x.id === where.id); if (!u) throw new Error("no user"); return u; } },
    person: {
      findFirst: async ({ where }: Row) => persons.find((p) => matches(p, where)) ?? null,
      create: async () => { throw new Error("no debe crearse una Person"); },
    },
    volunteerParticipation: {
      findUnique: async ({ where }: Row) => volunteers.find((v) => v.eventId === where.eventId_personId.eventId && v.personId === where.eventId_personId.personId) ?? null,
      create: async ({ data }: Row) => { const v = { id: `v${++seq}`, ...data }; volunteers.push(v); return v; },
    },
    volunteerConsentCode: {
      count: async ({ where }: Row) => codes.filter((c) => matches(c, where)).length,
      create: async ({ data }: Row) => {
        const row = { id: `c${++seq}`, usedAt: null, eventId: null, requestedById: null, acceptedAt: null, declinedAt: null, volunteerId: null, createdAt: new Date(), ...data };
        codes.push(row); return row;
      },
      updateMany: async ({ where, data }: Row) => { const hit = codes.filter((c) => matches(c, where)); hit.forEach((c) => Object.assign(c, data)); return { count: hit.length }; },
      findUnique: async ({ where }: Row) => {
        const c = codes.find((x) => x.codeHash === where.codeHash);
        return c ? { ...c, user: users.find((u) => u.id === c.userId) } : null;
      },
      findFirst: async ({ where }: Row) => {
        const c = codes.find((x) => matches(x, where));
        if (!c) return null;
        const e = events.find((x) => x.id === c.eventId);
        return { ...c, event: e ? { ...e, organization: { status: e.orgStatus } } : null };
      },
    },
  };
  const addAccount = (over: Row = {}) => {
    const personId = `p${++seq}`;
    persons.push({ id: personId, mergedIntoId: null });
    const user = { id: `u${++seq}`, accountType: "PILGRIM", isActive: true, emailVerifiedAt: new Date(), personId, ...over };
    users.push(user); return user;
  };
  const addEvent = (over: Row = {}) => {
    const e = { id: `e${++seq}`, organizationId: "org-c", status: "SCHEDULED", capabilities: ["INFO", "VOLUNTEERS"], orgStatus: "APPROVED", ...over };
    events.push(e); return e;
  };
  return { tx: tx as any, users, persons, codes, events, volunteers, addAccount, addEvent, locks: () => locks };
}
const rejects = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: any) => e.code === code);
const STAFF = "staff-1";
/** Persona con código, organización que lo canjea para un evento: devuelve la solicitud. */
async function pending(db: ReturnType<typeof fakeDb>, over: Row = {}) {
  const u = db.addAccount(); const ev = db.addEvent(over);
  const c = await issueVolunteerConsentCode(db.tx, u.id);
  const r = await requestVolunteerConsent(db.tx, { code: c.code, eventId: ev.id, staffUserId: STAFF });
  return { u, ev, c, requestId: r.requestId };
}

describe("A5.1 consentimiento: generación (desde la cuenta)", () => {
  it("PILGRIM activa y verificada: código de 10 caracteres; en la BD solo el hash; vence", async () => {
    const db = fakeDb(); const u = db.addAccount();
    const c = await issueVolunteerConsentCode(db.tx, u.id);
    assert.match(c.code, /^[A-Z0-9]{10}$/);
    assert.equal(db.codes[0].codeHash, hashAccess(c.code));
    assert.equal(db.codes[0].userId, u.id); // pertenece a esa cuenta
    assert.ok(!JSON.stringify(db.codes).includes(c.code));
    const hours = (c.expiresAt.getTime() - Date.now()) / 3_600_000;
    assert.ok(hours > VOLUNTEER_CONSENT_CODE_HOURS - 0.1 && hours <= VOLUNTEER_CONSENT_CODE_HOURS);
  });
  it("sin verificar, inactiva o de personal → no genera", async () => {
    const db = fakeDb();
    await rejects(issueVolunteerConsentCode(db.tx, db.addAccount({ emailVerifiedAt: null }).id), "ACCOUNT_NOT_VERIFIED");
    await rejects(issueVolunteerConsentCode(db.tx, db.addAccount({ isActive: false }).id), "ACCOUNT_INACTIVE");
    await rejects(issueVolunteerConsentCode(db.tx, db.addAccount({ accountType: "STAFF" }).id), "ACCOUNT_INACTIVE");
    assert.equal(db.codes.length, 0);
  });
  it("aleatorio: 200 códigos distintos", async () => {
    const db = fakeDb(); const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add((await issueVolunteerConsentCode(db.tx, db.addAccount().id)).code);
    assert.equal(seen.size, 200);
  });
  it("uno nuevo invalida el anterior sin canjear; límite por hora", async () => {
    const db = fakeDb(); const u = db.addAccount(); const ev = db.addEvent();
    const first = await issueVolunteerConsentCode(db.tx, u.id);
    await issueVolunteerConsentCode(db.tx, u.id);
    await rejects(requestVolunteerConsent(db.tx, { code: first.code, eventId: ev.id, staffUserId: STAFF }), "INVALID_VOLUNTEER_CODE");
    for (let i = 2; i < MAX_CONSENT_CODES_PER_HOUR; i++) await issueVolunteerConsentCode(db.tx, u.id);
    await rejects(issueVolunteerConsentCode(db.tx, u.id), "TOO_MANY_CODES");
  });
});

describe("A5.1 consentimiento: canje por la organización (solicitud acotada a un evento)", () => {
  it("válido → solicitud PENDIENTE para ese evento; sin datos de la persona; sin voluntariado todavía", async () => {
    const db = fakeDb(); const u = db.addAccount(); const ev = db.addEvent();
    const c = await issueVolunteerConsentCode(db.tx, u.id);
    const r = await requestVolunteerConsent(db.tx, { code: formatCode(c.code).toLowerCase(), eventId: ev.id, staffUserId: STAFF });
    assert.deepEqual(Object.keys(r), ["requestId"]); // ni personId, ni nombre, ni userId
    const row = db.codes[0];
    assert.equal(row.eventId, ev.id); assert.equal(row.requestedById, STAFF); assert.ok(row.usedAt instanceof Date);
    assert.equal(consentRequestStatus(row), "PENDING");
    assert.equal(db.volunteers.length, 0);
  });
  it("inválido, usado, vencido o de cuenta desactivada → la misma respuesta (no enumera)", async () => {
    const db = fakeDb(); const ev = db.addEvent();
    await rejects(requestVolunteerConsent(db.tx, { code: "ZZZZZ-ZZZZZ", eventId: ev.id, staffUserId: STAFF }), "INVALID_VOLUNTEER_CODE");
    const { c } = await pending(db);
    await rejects(requestVolunteerConsent(db.tx, { code: c.code, eventId: ev.id, staffUserId: STAFF }), "INVALID_VOLUNTEER_CODE"); // usado
    const u2 = db.addAccount(); const c2 = await issueVolunteerConsentCode(db.tx, u2.id);
    db.codes.find((x) => x.id === c2.id)!.expiresAt = new Date(Date.now() - 1000);
    await rejects(requestVolunteerConsent(db.tx, { code: c2.code, eventId: ev.id, staffUserId: STAFF }), "INVALID_VOLUNTEER_CODE"); // vencido
    const u3 = db.addAccount(); const c3 = await issueVolunteerConsentCode(db.tx, u3.id); u3.isActive = false;
    await rejects(requestVolunteerConsent(db.tx, { code: c3.code, eventId: ev.id, staffUserId: STAFF }), "INVALID_VOLUNTEER_CODE");
  });
  it("consumo atómico: dos organizaciones canjean el mismo código a la vez → solo una obtiene la solicitud", async () => {
    const db = fakeDb(); const u = db.addAccount(); const e1 = db.addEvent(), e2 = db.addEvent({ organizationId: "org-d" });
    const c = await issueVolunteerConsentCode(db.tx, u.id);
    const results = await Promise.allSettled([
      requestVolunteerConsent(db.tx, { code: c.code, eventId: e1.id, staffUserId: "s1" }),
      requestVolunteerConsent(db.tx, { code: c.code, eventId: e2.id, staffUserId: "s2" }),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal((results.find((x) => x.status === "rejected") as PromiseRejectedResult).reason.code, "INVALID_VOLUNTEER_CODE");
    assert.ok([e1.id, e2.id].includes(db.codes[0].eventId));
  });
});

describe("A5.1 consentimiento: respuesta de la persona (alcance explícito)", () => {
  it("aceptar → VolunteerParticipation APROBADA en ESE evento con su Person existente; sin otra Person", async () => {
    const db = fakeDb(); const { u, ev, requestId } = await pending(db);
    const r = await answerVolunteerRequest(db.tx, u.id, requestId, true);
    assert.equal(db.volunteers.length, 1);
    assert.deepEqual({ ...db.volunteers[0], id: undefined }, { id: undefined, eventId: ev.id, personId: u.personId, status: "APPROVED", createdById: STAFF });
    assert.equal(db.persons.length, 1);
    assert.equal(r.organizationId, "org-c");
    const row = db.codes[0];
    assert.ok(row.acceptedAt instanceof Date); assert.equal(row.volunteerId, r.volunteerId);
    assert.equal(consentRequestStatus(row), "ACCEPTED");
    assert.ok(db.locks() >= 1); // Person bloqueada
  });
  it("rechazar → sin voluntariado; no se puede aceptar después", async () => {
    const db = fakeDb(); const { u, requestId } = await pending(db);
    await answerVolunteerRequest(db.tx, u.id, requestId, false);
    assert.equal(db.volunteers.length, 0);
    assert.equal(consentRequestStatus(db.codes[0]), "DECLINED");
    await rejects(answerVolunteerRequest(db.tx, u.id, requestId, true), "REQUEST_NOT_PENDING");
  });
  it("solo la cuenta dueña responde; una sola respuesta; vencida no se responde", async () => {
    const db = fakeDb(); const { u, requestId } = await pending(db);
    const other = db.addAccount();
    await rejects(answerVolunteerRequest(db.tx, other.id, requestId, true), "REQUEST_NOT_PENDING");
    await answerVolunteerRequest(db.tx, u.id, requestId, true);
    await rejects(answerVolunteerRequest(db.tx, u.id, requestId, true), "REQUEST_NOT_PENDING");
    assert.equal(db.volunteers.length, 1);
    const p2 = await pending(db);
    db.codes.find((x) => x.id === p2.requestId)!.expiresAt = new Date(Date.now() - 1);
    await rejects(answerVolunteerRequest(db.tx, p2.u.id, p2.requestId, true), "REQUEST_NOT_PENDING");
  });
  it("un código no canjeado no es una solicitud (la persona no puede autoasignarse)", async () => {
    const db = fakeDb(); const u = db.addAccount();
    const c = await issueVolunteerConsentCode(db.tx, u.id);
    await rejects(answerVolunteerRequest(db.tx, u.id, c.id, true), "REQUEST_NOT_PENDING");
  });
  it("al aceptar se revalida el evento: sin VOLUNTEERS, cerrado u organización no aprobada → no se suma", async () => {
    for (const over of [{ capabilities: ["INFO"] }, { status: "FINISHED" }, { status: "CANCELLED" }, { orgStatus: "SUSPENDED" }]) {
      const db = fakeDb(); const { u, requestId } = await pending(db, over);
      await rejects(answerVolunteerRequest(db.tx, u.id, requestId, true), "EVENT_NOT_ACCEPTING_VOLUNTEERS");
      assert.equal(db.volunteers.length, 0);
    }
  });
  it("ya voluntaria en ese evento → sin duplicado", async () => {
    const db = fakeDb(); const { u, ev, requestId } = await pending(db);
    db.volunteers.push({ id: "v-prev", eventId: ev.id, personId: u.personId });
    await rejects(answerVolunteerRequest(db.tx, u.id, requestId, true), "VOLUNTEER_EXISTS");
    assert.equal(db.volunteers.length, 1);
  });
  it("Person fusionada → no se suma", async () => {
    const db = fakeDb(); const { u, requestId } = await pending(db);
    db.persons[0].mergedIntoId = "otra";
    await rejects(answerVolunteerRequest(db.tx, u.id, requestId, true), "PERSON_MERGED");
  });
});

describe("A5.1 consentimiento: rutas, permisos, auditoría y privacidad", () => {
  const routes = read("src/routes/volunteers.ts");
  const acct = read("src/routes/pilgrimAccount.ts");
  const reqRoute = routes.slice(routes.indexOf('app.post("/consent-requests"'), routes.indexOf('app.get("/consent-requests"'));
  it("canje: volunteer:manage (nunca OPERATOR), capacidad VOLUNTEERS, evento abierto, organización aprobada, límite", () => {
    assert.match(reqRoute, /preHandler: manage/);
    assert.match(reqRoute, /await writable\(req, eventId\)/);
    assert.match(reqRoute, /assertOpen\(event\.status\)/);
    assert.match(reqRoute, /req\.auth\.organizationStatus !== "APPROVED"/);
    assert.match(reqRoute, /rateLimit: \{ max: 20, timeWindow: "1 minute" \}/);
    assert.ok(ROLE_PERMISSIONS.ADMIN.has("volunteer:manage") && ROLE_PERMISSIONS.SUPERADMIN.has("volunteer:manage"));
    assert.ok(!ROLE_PERMISSIONS.OPERATOR.has("volunteer:manage"));
  });
  it("canje: respuesta sin datos de la persona; auditado sin el código", () => {
    assert.match(reqRoute, /send\(\{ requestId: r\.requestId, status: "PENDING", message:/);
    assert.match(reqRoute, /"VOLUNTEER_CONSENT_REQUESTED", "VolunteerConsentCode", out\.requestId\)/);
    assert.doesNotMatch(reqRoute, /audit\([^)]*code[,)]/);
  });
  it("listado de la organización: datos de la persona solo si aceptó", () => {
    const list = routes.slice(routes.indexOf('app.get("/consent-requests"'));
    assert.match(list, /volunteer: r\.acceptedAt && r\.volunteer \?/);
    assert.match(list, /where: \{ eventId \}/);
  });
  it("persona: generar, listar y responder solo con la sesión de su cuenta; auditado (aceptar/rechazar y el alta vía consentimiento)", () => {
    for (const p of ['"/volunteer-consent-code"', '"/volunteer-requests"', "`/volunteer-requests/:id/${accept"]) {
      const at = acct.indexOf(p); assert.ok(at > 0, p);
      assert.match(acct.slice(at, at + 200), /preHandler: app\.authenticatePilgrimAccount/);
    }
    assert.match(acct, /action: accept \? "VOLUNTEER_CONSENT_ACCEPTED" : "VOLUNTEER_CONSENT_DECLINED"/);
    assert.match(acct, /action: "VOLUNTEER_CREATED"[^\n]*via: "CONSENT_CODE"/);
    assert.match(acct, /action: "VOLUNTEER_CONSENT_CODE_ISSUED"[^\n]*metadata: \{ expiresAt: c\.expiresAt\.toISOString\(\) \}/);
    assert.match(acct, /Cache-Control", "no-store"/);
  });
  it("alta directa: sin código y sin identificar Personas globales (solo visibles o nuevas)", () => {
    const create = stripComments(routes.slice(routes.indexOf('app.post("/volunteers"'), routes.indexOf('app.post("/consent-requests"')));
    assert.match(create, /via: "STAFF"/);
    assert.doesNotMatch(create, /consent/i);
    const lib = read("src/lib/persons.ts");
    const fn = stripComments(lib.slice(lib.indexOf("export async function resolvePersonForVolunteering"), lib.indexOf("/** Eventos en los que una Person")));
    assert.match(fn, /return resolvePersonForParticipation\(tx, scope, input\)/);
    assert.doesNotMatch(read("src/routes/persons.ts"), /volunteerConsent/);
  });
  it("código propio: nunca usa Person.claimCodeHash", () => {
    assert.doesNotMatch(stripComments(read("src/lib/volunteerConsent.ts")), /claimCode/);
  });
  it("esquemas: el alta directa ya no acepta código; el canje solo acepta el código", () => {
    assert.equal(createVolunteerSchema.safeParse({ consentCode: "ABCDE-FGHJK" }).success, false);
    assert.equal(volunteerConsentRequestSchema.safeParse({ code: "ABCDE-FGHJK" }).success, true);
    assert.equal(volunteerConsentRequestSchema.safeParse({ code: "ABCDE-FGHJK", personId: "x" }).success, false);
    assert.equal(volunteerConsentRequestSchema.safeParse({ code: "corto" }).success, false);
  });
  it("migración: aditiva; hash único; un voluntariado por solicitud; FKs; CHECKs del ciclo", () => {
    const m = read("prisma/migrations/20261011000100_volunteer_consent_code/migration.sql");
    assert.match(m, /CREATE TABLE "VolunteerConsentCode"/);
    assert.match(m, /CREATE UNIQUE INDEX "VolunteerConsentCode_codeHash_key"/);
    assert.match(m, /CREATE UNIQUE INDEX "VolunteerConsentCode_volunteerId_key"/);
    assert.match(m, /"VolunteerConsentCode_eventId_fkey" FOREIGN KEY \("eventId"\) REFERENCES "Event"\("id"\) ON DELETE RESTRICT/);
    assert.match(m, /"VolunteerConsentCode_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE/);
    for (const c of ["request_complete", "answer_after_request", "single_answer", "accept_complete"]) assert.match(m, new RegExp(`"VolunteerConsentCode_${c}" *\\n? *CHECK`));
    assert.doesNotMatch(m, /^\s*(DELETE|UPDATE|TRUNCATE|DROP)\b/im);
  });
});
