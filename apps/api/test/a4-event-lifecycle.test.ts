/**
 * A4 — Ciclo de vida de Event, inscripción y participación derivadas, capacidades. Tests sin base de datos.
 * La migración sobre datos heredados y el E2E se ejecutan contra PostgreSQL local (PGlite).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_EVENT_CAPABILITIES, EVENT_CAPABILITIES, PARTICIPANT_STATUSES, isCapacityFull, EVENT_INITIAL_STATUSES, EVENT_STATUSES, EVENT_STATUS_LABEL, EVENT_TYPE_INFO,
  IMPLEMENTED_EVENT_CAPABILITIES, RESERVED_EVENT_CAPABILITIES, canTransitionEvent, createEventSchema, deriveAttendance,
  deriveRegistrationState, isRegistrationOpenNow, validateEventCapabilities, validateEventCoherence,
  type EventCapability, type EventStatus,
} from "@peregrinos/shared";
import { assertEventCapability, assertEventTransition, assertOwnDataRemovable } from "../src/lib/eventLifecycle";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("A4: ciclo de vida de Event", () => {
  const allowed = new Set(["DRAFT>SCHEDULED", "SCHEDULED>DRAFT", "SCHEDULED>IN_PROGRESS", "IN_PROGRESS>FINISHED",
    "DRAFT>CANCELLED", "SCHEDULED>CANCELLED", "IN_PROGRESS>CANCELLED"]);
  it("exactamente las transiciones aprobadas; todo lo demás se rechaza (409)", () => {
    for (const from of EVENT_STATUSES) for (const to of EVENT_STATUSES) {
      if (from === to) continue;
      const ok = allowed.has(`${from}>${to}`);
      assert.equal(canTransitionEvent(from, to), ok, `${from}>${to}`);
      if (ok) assert.doesNotThrow(() => assertEventTransition(from, to));
      else assert.throws(() => assertEventTransition(from, to), (e: { status?: number; code?: string }) => e.status === 409 && e.code === "INVALID_EVENT_TRANSITION");
    }
  });
  it("prohibidas explícitas: DRAFT→IN_PROGRESS, DRAFT→FINISHED, SCHEDULED→FINISHED, IN_PROGRESS→DRAFT", () => {
    for (const [a, b] of [["DRAFT", "IN_PROGRESS"], ["DRAFT", "FINISHED"], ["SCHEDULED", "FINISHED"], ["IN_PROGRESS", "DRAFT"]] as const) {
      assert.equal(canTransitionEvent(a, b), false);
    }
  });
  it("FINISHED y CANCELLED son terminales", () => {
    for (const t of ["FINISHED", "CANCELLED"] as const) for (const to of EVENT_STATUSES) if (to !== t) assert.equal(canTransitionEvent(t, to), false);
  });
  it("mantener el mismo estado no es una transición", () => {
    for (const s of EVENT_STATUSES) assert.doesNotThrow(() => assertEventTransition(s, s));
  });
  it("el alta solo admite DRAFT o SCHEDULED", () => {
    assert.deepEqual([...EVENT_INITIAL_STATUSES], ["DRAFT", "SCHEDULED"]);
    for (const s of EVENT_STATUSES) {
      const r = createEventSchema.safeParse({ name: "Evento", startsAt: "2027-01-01T10:00:00Z", status: s });
      assert.equal(r.success, s === "DRAFT" || s === "SCHEDULED", s);
    }
  });
  it("etiquetas: SCHEDULED = Publicado, FINISHED = Finalizado", () => {
    assert.equal(EVENT_STATUS_LABEL.SCHEDULED, "Publicado");
    assert.equal(EVENT_STATUS_LABEL.FINISHED, "Finalizado");
  });
  it("REGISTRATION_OPEN/CLOSED no son estados del evento", () => {
    assert.ok(!(EVENT_STATUSES as readonly string[]).includes("REGISTRATION_OPEN"));
    assert.ok(!(EVENT_STATUSES as readonly string[]).includes("REGISTRATION_CLOSED"));
  });
});

describe("A4: estado derivado de la inscripción", () => {
  const all = [...DEFAULT_EVENT_CAPABILITIES];
  const base = { capabilities: all, registrationOpen: true, status: "SCHEDULED" as EventStatus, registrationOpensAt: null, registrationClosesAt: null, capacity: null as number | null, activeParticipants: 0 };
  const now = new Date("2027-01-10T12:00:00Z");
  it("DISABLED sin la capacidad REGISTRATION", () =>
    assert.equal(deriveRegistrationState({ ...base, capabilities: all.filter((c) => c !== "REGISTRATION") }, now), "DISABLED"));
  it("OPEN: capacidad + interruptor + evento publicado o en curso", () => {
    assert.equal(deriveRegistrationState(base, now), "OPEN");
    assert.equal(deriveRegistrationState({ ...base, status: "IN_PROGRESS" }, now), "OPEN");
  });
  it("CLOSED: interruptor apagado o evento en borrador/finalizado/cancelado", () => {
    assert.equal(deriveRegistrationState({ ...base, registrationOpen: false }, now), "CLOSED");
    for (const s of ["DRAFT", "FINISHED", "CANCELLED"] as const) assert.equal(deriveRegistrationState({ ...base, status: s }, now), "CLOSED", s);
  });
  it("ventana: NOT_YET_OPEN antes de abrir, CLOSED después de cerrar", () => {
    assert.equal(deriveRegistrationState({ ...base, registrationOpensAt: new Date("2027-01-11T00:00:00Z") }, now), "NOT_YET_OPEN");
    assert.equal(deriveRegistrationState({ ...base, registrationClosesAt: new Date("2027-01-09T00:00:00Z") }, now), "CLOSED");
  });
  it("isRegistrationOpenNow coincide con OPEN", () => {
    assert.equal(isRegistrationOpenNow(base, now), true);
    assert.equal(isRegistrationOpenNow({ ...base, capabilities: ["INFO", "PARTICIPANTS"] }, now), false);
  });
  it("el estado de la inscripción nunca cambia el estado del evento (función pura, sin escritura)", () => {
    const e = { ...base };
    deriveRegistrationState(e, now);
    assert.equal(e.status, "SCHEDULED");
  });
});

describe("A4: asistencia derivada (sin columna)", () => {
  it("ATTENDED con al menos una llegada ACTIVE", () =>
    assert.equal(deriveAttendance({ eventStatus: "IN_PROGRESS", participantStatus: "ACTIVE", activeCheckins: 1 }), "ATTENDED"));
  it("NO_SHOW: evento FINISHED, participante ACTIVE, sin llegadas", () =>
    assert.equal(deriveAttendance({ eventStatus: "FINISHED", participantStatus: "ACTIVE", activeCheckins: 0 }), "NO_SHOW"));
  it("sin determinar mientras el evento no terminó o si el participante no está ACTIVE", () => {
    assert.equal(deriveAttendance({ eventStatus: "IN_PROGRESS", participantStatus: "ACTIVE", activeCheckins: 0 }), null);
    assert.equal(deriveAttendance({ eventStatus: "FINISHED", participantStatus: "CANCELLED", activeCheckins: 0 }), null);
  });
});

describe("A4: capacidades", () => {
  it("enum completo; reservadas COMMUNICATIONS y DOCUMENTS (A5.1 habilitó VOLUNTEERS)", () => {
    assert.deepEqual([...EVENT_CAPABILITIES], ["INFO", "LOCATION", "REGISTRATION", "PARTICIPANTS", "CHECKIN", "ROUTE", "POINTS", "CONTACTS", "CERTIFICATES", "VOLUNTEERS", "COMMUNICATIONS", "DOCUMENTS"]);
    assert.deepEqual([...RESERVED_EVENT_CAPABILITIES], ["COMMUNICATIONS", "DOCUMENTS"]);
    assert.ok(!(EVENT_CAPABILITIES as readonly string[]).includes("STATISTICS"));
  });
  it("por defecto: lo implementado hasta A4 (VOLUNTEERS se activa por evento; no depende del tipo)", () => {
    assert.deepEqual([...DEFAULT_EVENT_CAPABILITIES], IMPLEMENTED_EVENT_CAPABILITIES.filter((c) => c !== "VOLUNTEERS"));
    assert.equal(validateEventCapabilities(DEFAULT_EVENT_CAPABILITIES).length, 0);
    for (const t of Object.values(EVENT_TYPE_INFO)) assert.deepEqual(Object.keys(t), ["label"]);
  });
  it("INFO es obligatoria; reservadas, repetidas y dependencias rotas se rechazan", () => {
    const bad: [EventCapability[], RegExp][] = [
      [["LOCATION"], /información básica/],
      [["INFO", "COMMUNICATIONS"], /todavía no está disponible/],
      [["INFO", "INFO"], /repetidas/],
      [["INFO", "REGISTRATION"], /requiere «Participantes»/],
      [["INFO", "CHECKIN", "PARTICIPANTS"], /requiere «Puntos»/],
      [["INFO", "CERTIFICATES"], /requiere «Participantes»/],
    ];
    for (const [caps, re] of bad) assert.ok(validateEventCapabilities(caps).some((i) => re.test(i.message)), caps.join(","));
    assert.equal(validateEventCapabilities(["INFO"]).length, 0);
  });
  it("coherencia: trayecto, lugar, inscripción y certificado exigen su capacidad", () => {
    const e = { type: "PATRONAL_FEAST" as const, startsAt: new Date(), hasRoute: false, capabilities: ["INFO"] as EventCapability[], hasLocation: false, registrationOpen: false, certificateEnabled: false };
    assert.equal(validateEventCoherence(e).length, 0);
    assert.match(validateEventCoherence({ ...e, hasRoute: true })[0].message, /trayecto/);
    assert.match(validateEventCoherence({ ...e, hasLocation: true })[0].message, /lugar/);
    assert.match(validateEventCoherence({ ...e, registrationOpen: true })[0].message, /inscripción/);
    assert.match(validateEventCoherence({ ...e, certificateEnabled: true })[0].message, /certificado/);
  });
  it("hasRoute ya no depende del tipo: una fiesta patronal con ROUTE admite trayecto", () => {
    assert.equal(validateEventCoherence({ type: "PATRONAL_FEAST", startsAt: new Date(), hasRoute: true, capabilities: ["INFO", "ROUTE"], hasLocation: false, registrationOpen: false, certificateEnabled: false }).length, 0);
  });
  it("assertEventCapability: módulo desactivado → 403 EVENT_CAPABILITY_DISABLED", () => {
    assert.throws(() => assertEventCapability({ capabilities: ["INFO"] }, "CONTACTS"), (e: { status?: number; code?: string }) => e.status === 403 && e.code === "EVENT_CAPABILITY_DISABLED");
    assert.doesNotThrow(() => assertEventCapability({ capabilities: ["INFO", "CONTACTS"] }, "CONTACTS"));
  });
});

describe("A4: el servidor usa las capacidades en cada módulo", () => {
  const gates: [string, string, number][] = [
    ["src/routes/participants.ts", "PARTICIPANTS", 4], ["src/routes/access.ts", "PARTICIPANTS", 2], ["src/routes/checkins.ts", "CHECKIN", 4],
    ["src/routes/checkpoints.ts", "POINTS", 4], ["src/routes/contacts.ts", "CONTACTS", 3], ["src/routes/registrations.ts", "REGISTRATION", 4],
  ];
  for (const [file, cap, n] of gates) {
    it(`${file}: ${n} rutas de escritura exigen ${cap}`, () => {
      assert.equal((read(file).match(new RegExp(`loadEventWith\\(req, eventId, "${cap}"\\)`, "g")) ?? []).length, n);
    });
  }
  it("la inscripción pública exige la capacidad y el cupo (estado derivado OPEN; FULL → 409)", () => {
    const s = read("src/routes/registration.ts");
    assert.match(s, /deriveRegistrationState\(\{ \.\.\.event, activeParticipants \}\)/);
    assert.match(s, /state === "FULL"\) throw new AppError\(409, "EVENT_FULL"/);
  });
  it("events.ts valida transición y no borra datos al desactivar capacidades", () => {
    const s = read("src/routes/events.ts");
    assert.match(s, /assertEventTransition\(before\.status, body\.status\)/);
    assert.match(s, /assertCapabilitiesRemovable\(tx, id, removed\)/);
    assert.match(s, /where: \{ id, status: before\.status \}/);
  });
  it("lockEvent usa $executeRaw (pg_advisory_xact_lock devuelve void; con $queryRaw Prisma falla)", () => {
    const s = read("src/lib/access.ts");
    assert.match(s, /tx\.\$executeRaw`SELECT pg_advisory_xact_lock\(hashtext\(\$\{eventId\}\)\)`/);
    assert.doesNotMatch(s, /\$queryRaw`SELECT pg_advisory_xact_lock/);
  });
  it("inscripciones: aprobar y rechazar son transiciones condicionales (sin pisarse)", () => {
    const s = read("src/routes/registrations.ts");
    assert.match(s, /updateMany\(\{\s*where: \{ id, status: reg\.status \}/);
    assert.match(s, /status: \{ in: \["PENDING_PROOF", "IN_REVIEW", "REJECTED"\] \}/);
  });
});

describe("A4: migración de capacidades", () => {
  const m = read("prisma/migrations/20261008000000_event_capabilities/migration.sql");
  it("crea el enum completo y la columna con todo lo implementado por defecto", () => {
    assert.match(m, /CREATE TYPE "EventCapability" AS ENUM \('INFO', 'LOCATION', 'REGISTRATION', 'PARTICIPANTS', 'CHECKIN', 'ROUTE', 'POINTS', 'CONTACTS', 'CERTIFICATES', 'VOLUNTEERS', 'COMMUNICATIONS', 'DOCUMENTS'\)/);
    assert.match(m, /ADD COLUMN\s+"capabilities" "EventCapability"\[\] DEFAULT ARRAY\['INFO', 'LOCATION', 'REGISTRATION', 'PARTICIPANTS', 'CHECKIN', 'ROUTE', 'POINTS', 'CONTACTS', 'CERTIFICATES'\]/);
  });
  it("CHECKs: INFO, reservadas, dependencias y datos del evento", () => {
    for (const c of ["Event_capabilities_info", "Event_capabilities_reserved", "Event_capabilities_dependencies",
      "Event_registration_requires_capability", "Event_certificate_requires_capability", "Event_location_requires_capability"]) {
      assert.match(m, new RegExp(`"${c}"`), c);
    }
  });
  it("solo completa la columna nueva: sin DELETE, TRUNCATE ni DROP", () => {
    assert.doesNotMatch(m, /^\s*(DELETE|TRUNCATE)\b/im);
    assert.doesNotMatch(m, /\bDROP (TABLE|COLUMN|TYPE)\b/i);
    const updates = m.match(/^\s*UPDATE\b[^;]*;/gim) ?? [];
    assert.equal(updates.length, 1);
    assert.match(updates[0], /SET "capabilities" = array_remove\("capabilities", 'ROUTE'\)/);
  });
});

describe("A4: decisiones cerradas (INACTIVE, FULL, capacidades con datos, REJECTED)", () => {
  it("Participant solo ACTIVE o CANCELLED (INACTIVE eliminado)", () => {
    assert.deepEqual([...PARTICIPANT_STATUSES], ["ACTIVE", "CANCELLED"]);
    assert.doesNotMatch(read("prisma/schema.prisma").match(/enum ParticipantStatus \{[^}]*\}/)![0], /INACTIVE/);
  });
  it("migración: aborta si hay filas INACTIVE (sin transformarlas) y reconstruye el enum", () => {
    const m = read("prisma/migrations/20261008000100_participant_status_active_cancelled/migration.sql");
    assert.match(m, /RAISE EXCEPTION/);
    assert.match(m, /CREATE TYPE "ParticipantStatus_new" AS ENUM \('ACTIVE', 'CANCELLED'\)/);
    assert.doesNotMatch(m, /^\s*(UPDATE|DELETE|TRUNCATE)\b/im);
  });
  it("cupo: solo con capacity; cuenta participantes ACTIVE", () => {
    assert.equal(isCapacityFull(null, 1000), false);
    assert.equal(isCapacityFull(2, 1), false);
    assert.equal(isCapacityFull(2, 2), true);
    assert.equal(isCapacityFull(2, 3), true);
  });
  it("FULL derivado: ACTIVE >= capacity con la inscripción abierta; nunca cambia el estado del evento", () => {
    const e = { capabilities: [...DEFAULT_EVENT_CAPABILITIES], registrationOpen: true, status: "SCHEDULED" as EventStatus, capacity: 2 };
    assert.equal(deriveRegistrationState({ ...e, activeParticipants: 1 }), "OPEN");
    assert.equal(deriveRegistrationState({ ...e, activeParticipants: 2 }), "FULL");
    assert.equal(deriveRegistrationState({ ...e, activeParticipants: 2, registrationOpen: false }), "CLOSED");
    assert.equal(isRegistrationOpenNow({ ...e, activeParticipants: 2 }), false);
    assert.equal(e.status, "SCHEDULED");
  });
  it("aprobar: comprueba y reserva el cupo dentro del bloqueo del evento", () => {
    const s = read("src/routes/registrations.ts");
    const approve = s.slice(s.indexOf('app.post("/:id/approve"'), s.indexOf('app.post("/:id/reject"'));
    assert.ok(approve.indexOf("lockEvent(tx, eventId)") < approve.indexOf("assertCapacityFor("), "el cupo se mira con el evento bloqueado");
    assert.match(read("src/lib/eventLifecycle.ts"), /tx\.participant\.count\(\{ where: \{ eventId, status: "ACTIVE" \} \}\)/);
  });
  it("REJECTED → APPROVED prohibido; REJECTED → IN_REVIEW solo con comprobante nuevo, condicional", () => {
    assert.match(read("src/routes/registrations.ts"), /if \(reg\.status === "REJECTED"\) \{\s*throw new AppError\(409, "REGISTRATION_REJECTED"/);
    assert.match(read("src/routes/pilgrim.ts"), /updateMany\(\{\s*where: \{ id: regId, status: \{ in: \["PENDING_PROOF", "IN_REVIEW", "REJECTED"\] \} \},\s*data: \{ status: "IN_REVIEW"/);
  });
  it("capacidad con datos propios del evento → 409 (lugar, trayecto, certificado); sin datos se puede", () => {
    const empty = { locationName: null, address: null, latitude: null, longitude: null, route: null, certificateEnabled: false, certificatePhrase: null };
    const is409 = (e: { status?: number; code?: string }) => e.status === 409 && e.code === "CAPABILITY_HAS_DATA";
    assert.throws(() => assertOwnDataRemovable({ ...empty, locationName: "Templo" }, ["LOCATION"]), is409);
    assert.throws(() => assertOwnDataRemovable({ ...empty, route: { eventId: "x" } }, ["ROUTE"]), is409);
    assert.throws(() => assertOwnDataRemovable({ ...empty, certificatePhrase: "Frase" }, ["CERTIFICATES"]), is409);
    assert.doesNotThrow(() => assertOwnDataRemovable(empty, ["LOCATION", "ROUTE", "CERTIFICATES"]));
    assert.doesNotThrow(() => assertOwnDataRemovable({ ...empty, locationName: "Templo" }, ["ROUTE"]));
  });
});
