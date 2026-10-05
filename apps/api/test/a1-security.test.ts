/**
 * A1 — Endurecimiento de cuentas y roles. Tests sin base de datos (esquemas y reglas de otorgamiento).
 * Ejecutar: npm run test:a1 (desde apps/api).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  acceptInvitationSchema, bootstrapSchema, canGrantRole, canInviteRole, createInvitationSchema,
  createUserSchema, loginSchema, registerPilgrimSchema, updateUserSchema,
} from "@peregrinos/shared";
import { assertCanPromoteToSuperadmin, assertNotSuperadminGrant } from "../src/lib/roles";

const pilgrim = {
  firstName: "Ana", lastName: "Pérez", email: "ana@example.com", documentNumber: "30111222",
  phone: "1155556666", password: "una-clave-segura", acceptTerms: true as const,
};
const escalation = [
  { accountType: "SUPERADMIN" }, { accountType: "STAFF" }, { role: "SUPERADMIN" }, { role: "ADMIN" },
  { role: "OPERATOR" }, { organizationId: "00000000-0000-0000-0000-000000000000" }, { isSuperadmin: true }, { extraPermissions: ["user:manage"] },
];

describe("registro público: deny-by-default", () => {
  it("acepta el cuerpo esperado", () => assert.ok(registerPilgrimSchema.safeParse(pilgrim).success));
  for (const extra of escalation) {
    it(`rechaza ${JSON.stringify(extra)}`, () => {
      const r = registerPilgrimSchema.safeParse({ ...pilgrim, ...extra });
      assert.equal(r.success, false);
      assert.ok(!r.success && r.error.issues.some((i) => i.code === "unrecognized_keys"));
    });
  }
});

describe("otros cuerpos de cuenta/rol son estrictos", () => {
  it("login", () => assert.equal(loginSchema.safeParse({ email: "a@b.co", password: "x", role: "SUPERADMIN" }).success, false));
  it("bootstrap", () => assert.equal(bootstrapSchema.safeParse({ organizationName: "Org", name: "Ana", email: "a@b.co", password: "una-clave-segura", accountType: "STAFF" }).success, false));
  it("aceptar invitación no permite elegir rol", () =>
    assert.equal(acceptInvitationSchema.safeParse({ token: "x".repeat(30), name: "Ana", password: "una-clave-segura", role: "SUPERADMIN" }).success, false));
  it("crear invitación", () => assert.equal(createInvitationSchema.safeParse({ email: "a@b.co", role: "OPERATOR", accountType: "STAFF" }).success, false));
  it("alta/edición de usuario", () => {
    assert.equal(createUserSchema.safeParse({ name: "Ana", email: "a@b.co", password: "una-clave-segura", role: "ADMIN", organizationId: "x" }).success, false);
    assert.equal(updateUserSchema.safeParse({ accountType: "STAFF" }).success, false);
    assert.equal(updateUserSchema.safeParse({ isActive: false }).success, true);
  });
});

describe("SUPERADMIN: único mecanismo de otorgamiento", () => {
  it("nunca por invitación ni por alta directa", () => {
    assert.throws(() => assertNotSuperadminGrant("SUPERADMIN", "INVITATION"), /invitar como superadministrador/);
    assert.throws(() => assertNotSuperadminGrant("SUPERADMIN", "USER_CREATE"), /superadministrador directamente/);
    assert.doesNotThrow(() => assertNotSuperadminGrant("ADMIN", "INVITATION"));
  });
  it("canInviteRole excluye SUPERADMIN incluso para un SUPERADMIN; canGrantRole conserva la jerarquía", () => {
    assert.equal(canInviteRole("SUPERADMIN", "SUPERADMIN"), false);
    assert.equal(canInviteRole("SUPERADMIN", "ADMIN"), true);
    assert.equal(canInviteRole("ADMIN", "ADMIN"), false);
    assert.equal(canInviteRole("ADMIN", "OPERATOR"), true);
    assert.equal(canInviteRole("OPERATOR", "OPERATOR"), false);
    assert.equal(canGrantRole("ADMIN", "SUPERADMIN"), false);
  });
  const sa = { id: "a", role: "SUPERADMIN" as const, accountType: "STAFF", organizationId: "o1" };
  const target = { id: "b", isActive: true, accountType: "STAFF", organizationId: "o1" };
  it("promoción válida: SUPERADMIN → miembro activo del personal de su organización", () => assert.doesNotThrow(() => assertCanPromoteToSuperadmin(sa, target)));
  it("rechaza a quien no es SUPERADMIN", () => assert.throws(() => assertCanPromoteToSuperadmin({ ...sa, role: "ADMIN" }, target)));
  it("rechaza autopromoción", () => assert.throws(() => assertCanPromoteToSuperadmin(sa, { ...target, id: "a" }), /propio nivel/));
  it("rechaza otra organización, cuentas PILGRIM e inactivas", () => {
    assert.throws(() => assertCanPromoteToSuperadmin(sa, { ...target, organizationId: "o2" }));
    assert.throws(() => assertCanPromoteToSuperadmin(sa, { ...target, accountType: "PILGRIM" }));
    assert.throws(() => assertCanPromoteToSuperadmin({ ...sa, accountType: "PILGRIM" }, target));
    assert.throws(() => assertCanPromoteToSuperadmin(sa, { ...target, isActive: false }), /activa/);
  });
});
