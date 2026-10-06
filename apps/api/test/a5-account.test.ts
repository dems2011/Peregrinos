/**
 * A5.0 — Área de cuenta del peregrino. Tests sin base de datos.
 * La migración y el E2E se ejecutan contra PostgreSQL local (PGlite).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { accountEmailSchema, changePasswordSchema, passwordResetConfirmSchema, registerPilgrimSchema } from "@peregrinos/shared";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const acct = read("src/routes/pilgrimAccount.ts");

describe("A5.0: esquemas", () => {
  const base = { firstName: "Ana", lastName: "Paz", email: "a@b.cd", documentNumber: "30111222", phone: "1155554444", password: "una-clave-segura", acceptTerms: true };
  it("registro PILGRIM: estricto y sin código de vinculación", () => {
    assert.equal(registerPilgrimSchema.safeParse(base).success, true);
    assert.equal(registerPilgrimSchema.safeParse({ ...base, claimCode: "ABCDE-FGHJK" }).success, false);
  });
  it("reenvío/recuperación: solo el correo", () => {
    assert.equal(accountEmailSchema.safeParse({ email: "a@b.cd" }).success, true);
    assert.equal(accountEmailSchema.safeParse({ email: "a@b.cd", accountType: "STAFF" }).success, false);
  });
  it("restablecer: token + contraseña de 10+ caracteres", () => {
    assert.equal(passwordResetConfirmSchema.safeParse({ token: "x".repeat(40), password: "corta" }).success, false);
    assert.equal(passwordResetConfirmSchema.safeParse({ token: "x".repeat(40), password: "una-clave-segura" }).success, true);
  });
  it("cambiar contraseña: exige la actual y una nueva distinta", () => {
    assert.equal(changePasswordSchema.safeParse({ currentPassword: "una-clave-segura", newPassword: "una-clave-segura" }).success, false);
    assert.equal(changePasswordSchema.safeParse({ currentPassword: "vieja", newPassword: "una-clave-nueva-1" }).success, true);
  });
});

describe("A5.0: sesión y separación PILGRIM/STAFF", () => {
  it("el JWT de la cuenta lleva la versión de sesión y se compara en cada petición", () => {
    assert.match(read("src/lib/session.ts"), /\{ sub: user\.id, accountType: "PILGRIM", sv: user\.sessionVersion \}/);
    assert.match(read("src/plugins/auth.ts"), /user\.sessionVersion !== sv/);
  });
  it("login de la cuenta: solo PILGRIM activo y verificado; nunca emite sesión del personal", () => {
    const login = acct.slice(acct.indexOf('"/login"'), acct.indexOf('"/resend-verification"'));
    assert.match(login, /user\.accountType === "PILGRIM" && user\.isActive/);
    assert.doesNotMatch(login, /issueSession\(|issuePlatformSession\(/);
  });
  it("anti-enumeración: el aviso de verificación solo con la contraseña correcta (login de cuenta y login general)", () => {
    assert.match(acct, /if \(ok && pilgrim && !user\.emailVerifiedAt\)/);
    assert.match(read("src/routes/auth.ts"), /ok &&\s*user\?\.isActive &&\s*user\.accountType === "PILGRIM" &&\s*!user\.emailVerifiedAt/);
  });
  it("reenvío y recuperación: respuesta fija (202) y límite por IP y por cuenta", () => {
    assert.match(acct, /reply\.status\(202\)\.send\(\{ message: GENERIC_RESEND \}\)/);
    assert.match(acct, /reply\.status\(202\)\.send\(\{ message: GENERIC_RESET \}\)/);
    assert.match(acct, /"\/resend-verification", limit\(5, "15 minutes"\)/);
    assert.match(acct, /"\/password-reset\/request", limit\(5, "15 minutes"\)/);
    assert.match(acct, /MAX_TOKENS_PER_WINDOW/);
  });
});

describe("A5.0: tokens", () => {
  it("verificación de correo: consumo condicional, un solo uso, vencimiento", () =>
    assert.match(read("src/routes/auth.ts"), /emailVerificationToken\.updateMany\(\{\s*where: \{ id: verification\.id, usedAt: null, expiresAt: \{ gt: now \} \}/));
  it("recuperación: hash, un solo uso, vencimiento, invalida sesiones y demás enlaces", () => {
    const c = acct.slice(acct.indexOf('"/password-reset/confirm"'), acct.indexOf('app.post("/password",'));
    assert.match(c, /findUnique\(\{ where: \{ tokenHash: sha256\(token\) \}/);
    assert.match(c, /updateMany\(\{ where: \{ id: row\.id, usedAt: null, expiresAt: \{ gt: now \} \}, data: \{ usedAt: now \} \}\)/);
    assert.match(c, /sessionVersion: \{ increment: 1 \}/);
    assert.match(c, /clearPilgrimAccountSession\(reply\)/);
  });
  it("el token de recuperación viaja en el fragmento (#) del enlace, nunca en una URL que llegue al servidor", () =>
    assert.match(acct, /\/cuenta\/restablecer#token=/));
  it("sin SMTP en producción nunca se escribe el cuerpo del correo (enlaces/tokens) en los logs", () =>
    assert.match(read("src/lib/mailer.ts"), /if \(cfg\.NODE_ENV === "production"\) \{\s*console\.warn\("\[correo no configurado\] Falta SMTP_URL: no se envió un correo\."\);/));
});

describe("A5.0: historial y canje", () => {
  it("historial: solo la Person vinculada a la cuenta (solo lectura)", () => {
    const h = acct.slice(acct.indexOf('"/history"'));
    assert.match(h, /where: \{ personId: user\.personId \}/);
    assert.doesNotMatch(h, /\.(create|update|delete|upsert)(Many)?\(/);
  });
  it("canje: mensajes específicos solo para quien tiene el código; reglas intactas", () => {
    const lib = read("src/lib/persons.ts");
    for (const c of ["PERSON_MERGED", "PERSON_ALREADY_LINKED", "CLAIM_CODE_EXPIRED", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_VERIFIED", "PERSON_MERGE_CONFLICT", "INVALID_CLAIM_CODE"]) assert.match(lib, new RegExp(`"${c}"`), c);
    const claim = lib.slice(lib.indexOf("export async function claimPersonForUser"), lib.indexOf("export async function unlinkAccount"));
    assert.doesNotMatch(claim, /tx\.user\.update|mergePersons/); // la identidad global de la cuenta nunca cambia
  });
});

describe("A5.0: migración", () => {
  const m = read("prisma/migrations/20261010000000_pilgrim_account/migration.sql");
  it("aditiva: sessionVersion + PasswordResetToken; sin DELETE/UPDATE/DROP", () => {
    assert.match(m, /ADD COLUMN\s+"sessionVersion" INTEGER NOT NULL DEFAULT 0/);
    assert.match(m, /CREATE TABLE "PasswordResetToken"/);
    assert.match(m, /CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key"/);
    assert.doesNotMatch(m, /^\s*(DELETE|UPDATE|TRUNCATE)\b/im);
    assert.doesNotMatch(m, /\bDROP\b/i);
  });
});

describe("A5.0: cierre (logout efectivo, registro sin enumeración, identidad global)", () => {
  const auth = read("src/routes/auth.ts");
  it("logout de la cuenta incrementa sessionVersion de forma condicional antes de borrar la cookie", () => {
    const lo = auth.slice(auth.indexOf('"/account/logout"'));
    assert.match(lo, /where: \{ id: d\.sub, accountType: "PILGRIM", sessionVersion: d\.sv \?\? 0 \},\s*data: \{ sessionVersion: \{ increment: 1 \} \}/);
    assert.ok(lo.indexOf("sessionVersion: { increment: 1 }") < lo.indexOf("clearPilgrimAccountSession(reply)"));
  });
  it("registro: una sola respuesta (202) para cuenta nueva, correo existente o documento existente; sin códigos que enumeren", () => {
    const reg = auth.slice(auth.indexOf('"/register-pilgrim"'), auth.indexOf('"/account/claim-person"'));
    assert.doesNotMatch(reg, /EMAIL_EXISTS|DOCUMENT_EXISTS/);
    assert.match(reg, /const accepted = \(\) => reply\.status\(202\)\.send\(\{ message: REGISTER_ACCEPTED \}\)/);
    assert.match(reg, /e\.code === "P2002"/); // carreras: la BD impide el duplicado y la respuesta es la misma
  });
  it("identidad global: tabla PersonClaim con una unión vigente por registro (índice parcial) y reversión completa", () => {
    const m = read("prisma/migrations/20261010000100_person_claim/migration.sql");
    assert.match(m, /CREATE UNIQUE INDEX "PersonClaim_active_source_unique" ON "PersonClaim"\("sourcePersonId"\) WHERE "reversedAt" IS NULL/);
    assert.match(m, /"PersonClaim_distinct_persons"/);
    assert.doesNotMatch(m, /^\s*(DELETE|UPDATE|TRUNCATE)\b/im);
  });
  it("fusión de un registro propio hacia la Person de una cuenta: queda registrada como unión reversible por esa organización", () => {
    const lib = read("src/lib/persons.ts");
    const merge = lib.slice(lib.indexOf("export async function mergePersons"), lib.indexOf("export function newClaimCode"));
    assert.match(merge, /if \(into\.user && !from\.user\) \{\s*claimId = \(await tx\.personClaim\.create\(/);
    assert.match(merge, /organizationId: scope\.organizationId, userId: into\.user\.id/);
    assert.ok(merge.indexOf("assertNoEventClash") < merge.indexOf("personClaim.create")); // conflictos antes de modificar
  });
  it("canje: la auditoría incluye también los voluntariados movidos", () => {
    assert.match(read("src/routes/auth.ts"), /action: "PERSON_CLAIMED"[^\n]*movedVolunteers: result\.movedVolunteers/);
  });
});
