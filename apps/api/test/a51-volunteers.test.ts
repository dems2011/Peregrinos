/**
 * A5.1 — Voluntarios. Tests sin base de datos (la migración y el E2E corren contra PostgreSQL local, PGlite).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_EVENT_CAPABILITIES, GRANTABLE_PERMISSIONS, IMPLEMENTED_EVENT_CAPABILITIES, ROLE_PERMISSIONS, VOLUNTEER_STATUSES,
  canTransitionVolunteer, createAssignmentSchema, createShiftSchema, createVolunteerSchema, validateEventCapabilities,
} from "@peregrinos/shared";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const routes = read("src/routes/volunteers.ts");

describe("A5.1: estados del voluntario (no es un rol de cuenta)", () => {
  it("estados aprobados; ASSIGNED/ACTIVE no existen (se derivan)", () => {
    assert.deepEqual([...VOLUNTEER_STATUSES], ["REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "WITHDRAWN", "REVOKED", "COMPLETED"]);
    assert.ok(!(VOLUNTEER_STATUSES as readonly string[]).includes("ASSIGNED"));
  });
  it("transiciones: terminales REJECTED/WITHDRAWN/REVOKED/COMPLETED; aprobar solo desde solicitado o en revisión", () => {
    assert.equal(canTransitionVolunteer("REQUESTED", "APPROVED"), true);
    assert.equal(canTransitionVolunteer("UNDER_REVIEW", "APPROVED"), true);
    assert.equal(canTransitionVolunteer("APPROVED", "REVOKED"), true);
    for (const t of ["REJECTED", "WITHDRAWN", "REVOKED", "COMPLETED"] as const) for (const to of VOLUNTEER_STATUSES) assert.equal(canTransitionVolunteer(t, to), false);
    assert.equal(canTransitionVolunteer("REJECTED", "APPROVED"), false);
  });
  it("User.role no gana valores nuevos (el voluntariado no es autorización)", () =>
    assert.match(read("prisma/schema.prisma"), /enum Role \{\s*SUPERADMIN\s*ADMIN\s*OPERATOR\s*\}/));
});

describe("A5.1: esquemas", () => {
  it("alta: Person existente o nombre; estricto", () => {
    assert.equal(createVolunteerSchema.safeParse({ personId: "8b0a5a0e-6c6c-4b6b-9c8d-111111111111" }).success, true);
    assert.equal(createVolunteerSchema.safeParse({ firstName: "Ana" }).success, true);
    assert.equal(createVolunteerSchema.safeParse({}).success, false);
    assert.equal(createVolunteerSchema.safeParse({ firstName: "Ana", role: "ADMIN" }).success, false);
    assert.equal(createVolunteerSchema.safeParse({ firstName: "Ana", status: "COMPLETED" }).success, false);
  });
  it("turno: fin posterior al inicio", () => {
    assert.equal(createShiftSchema.safeParse({ startsAt: "2027-01-01T10:00:00Z", endsAt: "2027-01-01T09:00:00Z" }).success, false);
    assert.equal(createShiftSchema.safeParse({ startsAt: "2027-01-01T10:00:00Z", endsAt: "2027-01-01T12:00:00Z" }).success, true);
  });
  it("asignación: función obligatoria; estricto", () => {
    assert.equal(createAssignmentSchema.safeParse({ volunteerId: "8b0a5a0e-6c6c-4b6b-9c8d-111111111111" }).success, false);
    assert.equal(createAssignmentSchema.safeParse({ volunteerId: "8b0a5a0e-6c6c-4b6b-9c8d-111111111111", functionId: "8b0a5a0e-6c6c-4b6b-9c8d-222222222222", personId: "x" }).success, false);
  });
});

describe("A5.1: permisos y capacidad", () => {
  it("volunteer:manage solo ADMIN y SUPERADMIN; no concedible", () => {
    assert.ok(ROLE_PERMISSIONS.ADMIN.has("volunteer:manage"));
    assert.ok(ROLE_PERMISSIONS.SUPERADMIN.has("volunteer:manage"));
    assert.ok(!ROLE_PERMISSIONS.OPERATOR.has("volunteer:manage"));
    assert.ok(!(GRANTABLE_PERMISSIONS as readonly string[]).includes("volunteer:manage"));
  });
  it("VOLUNTEERS implementada, válida y fuera del valor inicial", () => {
    assert.ok((IMPLEMENTED_EVENT_CAPABILITIES as readonly string[]).includes("VOLUNTEERS"));
    assert.equal(validateEventCapabilities(["INFO", "VOLUNTEERS"]).length, 0);
    assert.ok(!DEFAULT_EVENT_CAPABILITIES.includes("VOLUNTEERS"));
  });
  it("todas las escrituras exigen la capacidad VOLUNTEERS; todas las rutas exigen volunteer:manage", () => {
    const writes = (routes.match(/app\.(post|patch)\(/g) ?? []).length;
    assert.equal((routes.match(/await writable\(req, eventId\)/g) ?? []).length, writes);
    assert.match(routes, /loadEventWith\(req, eventId, "VOLUNTEERS"\)/);
    assert.equal((routes.match(/\{ preHandler: manage[ ,]/g) ?? []).length, (routes.match(/app\.(get|post|patch)\(/g) ?? []).length);
  });
  it("desactivar VOLUNTEERS con datos → 409 (conteo declarado)", () =>
    assert.match(read("src/lib/eventLifecycle.ts"), /VOLUNTEERS: async \(tx, eventId\) => \{/));
});

describe("A5.1: integridad y auditoría", () => {
  it("asignar: evento bloqueado, voluntario aprobado, sin superposición de turnos", () => {
    const a = routes.slice(routes.indexOf('app.post("/assignments"'), routes.indexOf('app.post("/assignments/:id/revoke"'));
    assert.ok(a.indexOf("lockEvent(tx, eventId)") < a.indexOf("SHIFT_OVERLAP"));
    assert.match(a, /VOLUNTEER_NOT_APPROVED/);
    assert.match(a, /ASSIGNMENT_EXISTS/);
  });
  it("auditoría en la misma transacción de alta, estado, catálogos, turnos, asignación y revocación", () => {
    for (const action of ["VOLUNTEER_CREATED", "VOLUNTEER_STATUS_CHANGED", "SHIFT_CREATED", "SHIFT_CANCELLED", "SHIFT_UPDATED", "VOLUNTEER_ASSIGNED", "VOLUNTEER_ASSIGNMENT_REVOKED"]) {
      assert.match(routes, new RegExp(`"${action}"`), action);
    }
    assert.match(routes, /`\$\{c\.entity\.toUpperCase\(\)\}_CREATED`/);
  });
  it("identidad global: canje, fusión y reversión incluyen las participaciones de voluntario", () => {
    const lib = read("src/lib/persons.ts");
    assert.match(lib, /volunteerParticipation\.updateMany\(\{ where: \{ personId: fromId \}, data: \{ personId: intoId \} \}\)/);
    assert.match(lib, /movedVolunteerIds: volunteerIds/);
    assert.match(lib, /where: \{ id: \{ in: c\.movedVolunteerIds \}, personId \}/);
    assert.match(lib, /\{ volunteerParticipations: \{ some: \{ event \} \} \}/);
  });
  it("migración: aditiva, CHECKs, índice parcial anti-duplicados y VOLUNTEERS sale de reservadas", () => {
    const m = read("prisma/migrations/20261011000000_volunteers/migration.sql");
    assert.match(m, /CREATE TYPE "VolunteerStatus"/);
    assert.match(m, /"Shift_ends_after_start" CHECK \("endsAt" > "startsAt"\)/);
    assert.match(m, /CREATE UNIQUE INDEX "VolunteerAssignment_active_unique"[\s\S]*WHERE "revokedAt" IS NULL/);
    assert.match(m, /CHECK \(NOT \("capabilities" && ARRAY\['COMMUNICATIONS', 'DOCUMENTS'\]::"EventCapability"\[\]\)\)/);
    assert.doesNotMatch(m, /^\s*(DELETE|UPDATE|TRUNCATE)\b/im);
    assert.doesNotMatch(m, /DROP (TABLE|COLUMN|TYPE)/i);
  });
});
