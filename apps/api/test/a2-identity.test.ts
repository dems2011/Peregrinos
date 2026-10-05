/**
 * A2 — Separación de identidad (PILGRIM) y autorización del personal (STAFF). Tests sin base de datos.
 * La prueba de la migración sobre datos heredados y el E2E se ejecutan contra PostgreSQL local (PGlite).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { registerPilgrimSchema } from "@peregrinos/shared";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const migration = read("prisma/migrations/20261006000000_pilgrim_identity_separation/migration.sql");
const schema = read("prisma/schema.prisma");
const authRoutes = read("src/routes/auth.ts");

describe("A2: migración", () => {
  it("vuelve opcionales organizationId y role", () => {
    assert.match(migration, /ALTER COLUMN "organizationId" DROP NOT NULL/);
    assert.match(migration, /ALTER COLUMN "role" DROP NOT NULL/);
  });
  it("solo normaliza cuentas PILGRIM y no borra filas", () => {
    assert.match(migration, /UPDATE "User"\s+SET "role" = NULL, "organizationId" = NULL, "extraPermissions" = '\{\}'\s+WHERE "accountType" = 'PILGRIM';/);
    assert.doesNotMatch(migration, /\bDELETE\b|\bTRUNCATE\b|\bDROP TABLE\b|\bDROP COLUMN\b/i);
  });
  it("la BD exige organización y rol al personal, y los prohíbe al peregrino", () => {
    assert.match(migration, /"User_staff_requires_org_and_role"\s+CHECK \("accountType" <> 'STAFF' OR \("organizationId" IS NOT NULL AND "role" IS NOT NULL\)\)/);
    assert.match(migration, /"User_pilgrim_without_staff_authz"\s+CHECK \("accountType" <> 'PILGRIM' OR \("organizationId" IS NULL AND "role" IS NULL AND COALESCE\(cardinality\("extraPermissions"\), 0\) = 0\)\)/);
  });
});

describe("A2: schema Prisma", () => {
  it("User.organizationId y User.role opcionales; la FK conserva ON DELETE RESTRICT", () => {
    assert.match(schema, /organizationId\s+String\?\n/);
    assert.match(schema, /role\s+Role\?\n/);
    assert.match(schema, /organization\s+Organization\?\s+@relation\(fields: \[organizationId\], references: \[id\], onDelete: Restrict\)/);
  });
  it("Participant y Registration conservan su vínculo opcional con la cuenta del peregrino", () => {
    assert.match(schema, /user\s+User\?\s+@relation\("PilgrimParticipations"/);
    assert.match(schema, /user\s+User\?\s+@relation\("PilgrimRegistrations"/);
  });
});

describe("A2: registro público", () => {
  it("no busca una organización ni asigna rol", () => {
    const start = authRoutes.indexOf('"/register-pilgrim"');
    const end = authRoutes.indexOf('"/verify-email"');
    const block = authRoutes.slice(start, end);
    assert.doesNotMatch(block, /organization\.findFirst/);
    const create = block.slice(block.indexOf("tx.user.create"), block.indexOf("emailVerificationToken.create"));
    assert.doesNotMatch(create, /organizationId|role:/);
    assert.match(create, /accountType: "PILGRIM"/);
  });
  it("el cliente no puede elegir organización", () => {
    const r = registerPilgrimSchema.safeParse({
      firstName: "Ana", lastName: "Pérez", email: "ana@example.com", documentNumber: "30111222",
      phone: "1155556666", password: "una-clave-segura", acceptTerms: true, organizationId: "00000000-0000-0000-0000-000000000000",
    });
    assert.equal(r.success, false);
  });
  it("el bootstrap solo considera al personal para decidir si el sistema está inicializado", () => {
    assert.match(authRoutes, /tx\.user\.count\(\{ where: \{ accountType: "STAFF" \} \}\)/);
  });
});
