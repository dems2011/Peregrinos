/**
 * Auditoría de seguridad (API + identidad). Tests sin base de datos: funciones puras y patrones sobre las fuentes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { auditItemView } from "../src/routes/audit";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("sec-audit: historial de la organización", () => {
  const base = { id: "a", action: "X", userId: "u1" };
  it("identifica al personal", () => {
    const v = auditItemView({ ...base, user: { id: "u1", name: "Ana", role: "ADMIN", accountType: "STAFF" } });
    assert.deepEqual(v.user, { id: "u1", name: "Ana", role: "ADMIN" });
    assert.equal(v.userId, "u1");
    assert.equal(v.actorType, "STAFF");
  });
  it("no expone nombre ni id de una cuenta PILGRIM o PLATFORM", () => {
    for (const accountType of ["PILGRIM", "PLATFORM"]) {
      const v = auditItemView({ ...base, user: { id: "u1", name: "Privado", role: null, accountType } });
      assert.equal(v.user, null);
      assert.equal(v.userId, null);
      assert.equal(v.actorType, accountType);
      assert.doesNotMatch(JSON.stringify(v), /Privado|u1/);
    }
  });
  it("la ruta aplica la vista a cada fila", () => {
    assert.match(read("src/routes/audit.ts"), /items: items\.map\(auditItemView\)/);
  });
});

describe("sec-audit: invitaciones (un solo uso, sin carreras, sin enumeración entre organizaciones)", () => {
  const s = read("src/routes/invitations.ts");
  it("aceptar exige el token vigente en el reclamo condicional (un reenvío invalida el enlace viejo)", () => {
    assert.match(s, /where: \{ id: inv\.id, tokenHash: sha256\(body\.token\), acceptedAt: null, revokedAt: null, expiresAt: \{ gt: new Date\(\) \} \}/);
  });
  it("reenviar y revocar son condicionales", () => {
    assert.match(s, /invitation\.updateMany\(\{\s*where: \{ id, organizationId: req\.auth\.organizationId, acceptedAt: null, revokedAt: null \}/);
    assert.match(s, /invitation\.updateMany\(\{ where: \{ id, organizationId: req\.auth\.organizationId, acceptedAt: null \}, data: \{ revokedAt/);
    assert.doesNotMatch(s, /invitation\.update\(\{ where: \{ id \}, data: \{ revokedAt/);
  });
  it("puntos de la invitación siempre acotados a la organización", () => {
    assert.equal((s.match(/id: \{ in: inv\.checkpointIds \}, event: \{ organizationId: inv\.organizationId \}/g) ?? []).length, 2);
  });
  it("el alta no revela cuentas de otras organizaciones", () => {
    assert.match(s, /user\.findFirst\(\{ where: \{ email: body\.email, organizationId: req\.auth\.organizationId \}/);
    assert.doesNotMatch(s, /user\.findUnique\(\{ where: \{ email: body\.email \} \}\)/);
  });
  it("PLATFORM: reenvío de fundador condicional", () => {
    assert.match(read("src/routes/platform.ts"), /invitation\.updateMany\(\{\s*where: \{ id: inv\.id, acceptedAt: null, revokedAt: null \}/);
  });
});

describe("sec-audit: llegadas (correcciones condicionales)", () => {
  const s = read("src/routes/checkins.ts");
  it("anular, corregir y resolver no usan update incondicional", () => {
    assert.doesNotMatch(s, /checkin\.update\(\{/);
    assert.match(s, /where: \{ id, eventId, status: c\.status \}, data: \{ status: "CANCELLED"/);
    assert.match(s, /where: \{ id, eventId, status: "ACTIVE" \}, data:/);
    assert.equal((s.match(/where: \{ id, eventId, status: "CONFLICT" \}/g) ?? []).length, 2);
  });
});

describe("sec-audit: personal y cuentas", () => {
  const s = read("src/routes/users.ts");
  it("el último SUPERADMIN se protege dentro de la transacción con bloqueo por organización", () => {
    assert.match(s, /pg_advisory_xact_lock\(hashtext\(\$\{`superadmins:\$\{orgId\}`\}\)\)/);
    assert.match(s, /ensureAnotherSuperadmin\(tx, /);
    assert.doesNotMatch(s, /ensureAnotherSuperadmin\(req\./);
  });
  it("desactivar o cambiar la clave invalida las sesiones (sessionVersion + 1)", () => {
    assert.equal((s.match(/sessionVersion: \{ increment: 1 \}/g) ?? []).length >= 2, true);
  });
});

describe("sec-audit: aislamiento entre organizaciones", () => {
  it("la marca de comprobante duplicado solo mira la propia organización", () => {
    const s = read("src/routes/registrations.ts");
    assert.match(s, /sha256: \{ in: proofs\.map\(\(p\) => p\.sha256\) \}, registration: \{ event: \{ organizationId \} \}/);
    assert.equal((s.match(/withDuplicateFlags\(.*, req\.auth\.organizationId\)/g) ?? []).length, 2);
  });
  it("el comprobante del peregrino queda en el historial de la organización del evento", () => {
    assert.match(read("src/routes/pilgrim.ts"), /action: "PAYMENT_PROOF_SUBMITTED"[^\n]*organizationId: reg\.event\.organizationId/);
  });
});

describe("sec-audit: identidad", () => {
  it("fusión: no mueve una cuenta cuya identidad tiene uniones vigentes (PersonClaim quedaría huérfano)", () => {
    const s = read("src/lib/persons.ts");
    const merge = s.slice(s.indexOf("export async function mergePersons"), s.indexOf("export function newClaimCode"));
    assert.match(merge, /personClaim\.count\(\{ where: \{ personId: fromId, reversedAt: null \} \}\)\) > 0\) \{\s*throw new AppError\(409, "PERSON_HAS_CLAIMS"/);
    assert.ok(merge.indexOf("PERSON_HAS_CLAIMS") < merge.indexOf("tx.user.updateMany"));
  });
  it("la ficha de Person muestra el voluntariado con el mismo alcance que el resto del historial", () => {
    assert.match(read("src/routes/persons.ts"), /volunteerParticipation\.findMany\(\{\s*where: \{ personId: id, event \}/);
  });
});
