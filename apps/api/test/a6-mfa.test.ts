/**
 * A6 — MFA del personal. Tests sin base de datos: criptografía (RFC 4226/6238), cifrado en reposo, códigos de
 * recuperación, esquemas y reglas de las rutas (sobre el código fuente).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isMfaChallenge, mfaConfirmSchema, mfaPasswordSchema, mfaVerifySchema } from "@peregrinos/shared";
import {
  STEP_UP_MINUTES,
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  hotp,
  isRecentMfa,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUrl,
  recoveryCodeHash,
  totpStep,
  verifyTotp,
} from "../src/lib/mfa";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
// Secreto de los vectores de prueba de RFC 4226 / RFC 6238 ("12345678901234567890" en ASCII).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("A6: TOTP (RFC 4226 / 6238)", () => {
  it("base32 ida y vuelta", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    assert.deepEqual(base32Decode(base32Encode(buf)), buf);
    assert.equal(RFC_SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    assert.throws(() => base32Decode("01!"));
  });
  it("HOTP: vectores del RFC 4226 (6 dígitos)", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, counter) => assert.equal(hotp(RFC_SECRET, counter), code));
  });
  it("TOTP: vectores del RFC 6238 (SHA-1, últimos 6 dígitos)", () => {
    const cases: [number, string][] = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"]];
    for (const [t, code] of cases) assert.equal(verifyTotp(RFC_SECRET, code, { atMs: t * 1000 }), totpStep(t * 1000));
  });
  it("ventana de ±1 paso, no más", () => {
    const at = 1_700_000_000_000;
    const s = totpStep(at);
    assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, s - 1), { atMs: at }), s - 1);
    assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, s + 1), { atMs: at }), s + 1);
    assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, s + 2), { atMs: at }), null);
    assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, s - 2), { atMs: at }), null);
  });
  it("anti-replay: un paso ya usado (o anterior) no se acepta", () => {
    const at = 1_700_000_000_000;
    const s = totpStep(at);
    const code = hotp(RFC_SECRET, s);
    assert.equal(verifyTotp(RFC_SECRET, code, { atMs: at, lastStep: s - 1 }), s);
    assert.equal(verifyTotp(RFC_SECRET, code, { atMs: at, lastStep: s }), null);
    assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, s - 1), { atMs: at, lastStep: s }), null);
  });
  it("formato: solo 6 dígitos (acepta espacio intermedio)", () => {
    const at = 1_700_000_000_000;
    const code = hotp(RFC_SECRET, totpStep(at));
    assert.notEqual(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { atMs: at }), null);
    for (const bad of ["", "12345", "1234567", "abcdef", "12345a"]) assert.equal(verifyTotp(RFC_SECRET, bad, { atMs: at }), null);
  });
  it("secreto nuevo: 160 bits aleatorios", () => {
    const a = newTotpSecret();
    assert.equal(base32Decode(a).length, 20);
    assert.notEqual(a, newTotpSecret());
  });
  it("otpauth URI con emisor y parámetros", () => {
    const u = otpauthUrl("ABCDEFGH", "ana@parroquia.org");
    assert.match(u, /^otpauth:\/\/totp\/Peregrinos%3Aana%40parroquia\.org\?secret=ABCDEFGH&issuer=Peregrinos&algorithm=SHA1&digits=6&period=30$/);
  });
});

describe("A6: secreto cifrado en reposo (AES-256-GCM)", () => {
  it("ida y vuelta; IV distinto en cada cifrado", () => {
    const a = encryptSecret("JBSWY3DPEHPK3PXP", "user-1");
    const b = encryptSecret("JBSWY3DPEHPK3PXP", "user-1");
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a, "user-1"), "JBSWY3DPEHPK3PXP");
    assert.doesNotMatch(a, /JBSWY3DPEHPK3PXP/);
  });
  it("ligado a la cuenta (AAD): copiado a otra cuenta no descifra", () => {
    const a = encryptSecret("JBSWY3DPEHPK3PXP", "user-1");
    assert.throws(() => decryptSecret(a, "user-2"));
  });
  it("manipulación o formato desconocido: error", () => {
    const [v, iv, tag, enc] = encryptSecret("JBSWY3DPEHPK3PXP", "u").split(".");
    const flipped = Buffer.from(enc, "base64url");
    flipped[0] ^= 1;
    assert.throws(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join("."), "u"));
    assert.throws(() => decryptSecret(["v2", iv, tag, enc].join("."), "u"));
    assert.throws(() => decryptSecret([v, iv, tag.slice(0, 8), enc].join("."), "u"));
    assert.throws(() => decryptSecret([v, iv, tag, enc, "x"].join("."), "u"));
  });
});

describe("A6: códigos de recuperación", () => {
  it("10 códigos distintos, legibles (XXXXX-XXXXX); solo se guarda el HMAC", () => {
    const codes = newRecoveryCodes("user-1");
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes.map((c) => c.display)).size, 10);
    for (const c of codes) {
      assert.match(c.display, /^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
      assert.match(c.hash, /^[0-9a-f]{64}$/);
      assert.equal(recoveryCodeHash("user-1", c.display), c.hash);
      // Tolerante a minúsculas y sin guion.
      assert.equal(recoveryCodeHash("user-1", c.display.replace("-", "").toLowerCase()), c.hash);
    }
  });
  it("el mismo código no sirve en otra cuenta", () => {
    const [c] = newRecoveryCodes("user-1");
    assert.notEqual(recoveryCodeHash("user-2", c.display), c.hash);
  });
});

describe("A6: step-up", () => {
  it(`ventana de ${STEP_UP_MINUTES} minutos`, () => {
    const now = 1_700_000_000_000;
    const sec = (ms: number) => Math.floor(ms / 1000);
    assert.equal(isRecentMfa(sec(now - 60_000), now), true);
    assert.equal(isRecentMfa(sec(now - STEP_UP_MINUTES * 60_000), now), true);
    assert.equal(isRecentMfa(sec(now - STEP_UP_MINUTES * 60_000 - 1000), now), false);
    assert.equal(isRecentMfa(null, now), false);
    assert.equal(isRecentMfa(undefined, now), false);
  });
});

describe("A6: esquemas", () => {
  it("verify: exactamente uno de code / recoveryCode", () => {
    assert.equal(mfaVerifySchema.safeParse({ code: "123456" }).success, true);
    assert.equal(mfaVerifySchema.safeParse({ code: "123 456" }).success, true);
    assert.equal(mfaVerifySchema.safeParse({ recoveryCode: "ABCDE-FGHJK" }).success, true);
    assert.equal(mfaVerifySchema.safeParse({}).success, false);
    assert.equal(mfaVerifySchema.safeParse({ code: "123456", recoveryCode: "ABCDE-FGHJK" }).success, false);
    assert.equal(mfaVerifySchema.safeParse({ code: "12345" }).success, false);
    assert.equal(mfaVerifySchema.safeParse({ code: "123456", userId: "x" }).success, false);
  });
  it("confirm y password estrictos", () => {
    assert.equal(mfaConfirmSchema.safeParse({ code: "000000" }).success, true);
    assert.equal(mfaConfirmSchema.safeParse({ code: "000000", secret: "X" }).success, false);
    assert.equal(mfaPasswordSchema.safeParse({ password: "" }).success, false);
  });
  it("isMfaChallenge distingue el desafío de un MeResponse", () => {
    assert.equal(isMfaChallenge({ mfaRequired: true }), true);
    assert.equal(isMfaChallenge({ user: {} }), false);
    assert.equal(isMfaChallenge(null), false);
  });
});

describe("A6: reglas de sesión y rutas (fuente)", () => {
  const auth = read("src/routes/auth.ts");
  const mfa = read("src/routes/mfa.ts");
  const plugin = read("src/plugins/auth.ts");
  const session = read("src/lib/session.ts");
  const flow = read("src/lib/mfaFlow.ts");

  it("login: con MFA activo emite el desafío y NO la sesión", () => {
    const branch = auth.slice(auth.indexOf("if (user.mfaEnabledAt)"), auth.indexOf("await issueSession(\n        app,\n        req,\n        reply,\n        user\n      );"));
    assert.match(branch, /issueMfaChallenge\(app, reply, user\)/);
    assert.match(branch, /return \{ mfaRequired: true as const \}/);
    assert.doesNotMatch(branch, /issueSession\(/);
  });
  it("desafío: cookie httpOnly limitada a /api/auth/mfa, corta y con versión de sesión", () => {
    assert.match(session, /purpose: "mfa-challenge", sv: user\.sessionVersion/);
    assert.match(session, /const MFA_CHALLENGE_PATH = "\/api\/auth\/mfa"/);
    assert.match(session, /expiresIn: `\$\{MFA_CHALLENGE_MINUTES\}m`/);
  });
  it("authenticate: rechaza tokens con propósito, versión vieja o sesión sin factor si hay MFA", () => {
    assert.match(plugin, /if \(!claims\.sub \|\| claims\.purpose\) throw unauthorized\(\)/);
    assert.match(plugin, /user\.sessionVersion !== sv/);
    assert.match(plugin, /\(user\.mfaEnabledAt && mfaSec === null\)/);
  });
  it("SUPERADMIN sin MFA: solo rutas marcadas mfaEnrollment", () => {
    assert.match(plugin, /mfaEnrollmentRequired\(user\) && !req\.routeOptions\.config\?\.mfaEnrollment/);
    assert.match(plugin, /"MFA_ENROLLMENT_REQUIRED"/);
    const marked = [...mfa.matchAll(/mfaEnrollment: true/g)].length + [...auth.matchAll(/mfaEnrollment: true/g)].length;
    assert.equal(marked, 3); // enroll/start, enroll/confirm, /me
  });
  it("refresh: rotación condicional y conserva mfaAt; con MFA exige sesión con factor", () => {
    assert.match(auth, /refreshToken\.updateMany\(\{\s*where: \{\s*id: token\.id,\s*revokedAt: null,/);
    assert.match(auth, /\{ mfaAt: token\.mfaAt \}/);
    assert.match(auth, /\(token\.user\.mfaEnabledAt && !token\.mfaAt\)/);
  });
  it("verificación: anti-replay condicional, código de recuperación de un solo uso, bloqueo por cuenta", () => {
    assert.match(flow, /OR: \[\{ mfaLastStep: null \}, \{ mfaLastStep: \{ lt: step \} \}\]/);
    assert.match(flow, /codeHash: recoveryCodeHash\(user\.id, input\.recoveryCode\), usedAt: null/);
    assert.match(flow, /MFA_MAX_FAILURES/);
    assert.match(flow, /user\.mfaLockedUntil && user\.mfaLockedUntil > now/);
  });
  it("auditoría de enrolamiento, baja, step-up y fallos", () => {
    for (const a of ["MFA_ENABLED", "MFA_DISABLED", "MFA_STEP_UP", "MFA_RECOVERY_CODES_REGENERATED", "MFA_ENROLL_FAILED"]) assert.match(mfa, new RegExp(`"${a}"`));
    for (const a of ["MFA_LOGIN_FAILED", "MFA_STEP_UP_FAILED", "MFA_RECOVERY_CODE_USED", "MFA_LOCKED_ATTEMPT"]) assert.match(flow, new RegExp(a));
  });
  it("enrolar, regenerar y desactivar exigen la contraseña; regenerar/desactivar además step-up", () => {
    assert.equal([...mfa.matchAll(/await assertPassword\(req, password,/g)].length, 3);
    assert.match(mfa, /"\/recovery-codes",\s*\{ preHandler: \[app\.authenticate, app\.requireRecentMfa\]/);
    assert.match(mfa, /"\/disable",\s*\{ preHandler: \[app\.authenticate, app\.requireRecentMfa\]/);
  });
  it("un SUPERADMIN no puede desactivar su MFA", () => {
    assert.match(mfa, /"MFA_REQUIRED_FOR_ROLE"/);
  });
  it("cambiar el MFA cierra las demás sesiones", () => {
    assert.match(mfa, /data: \{ sessionVersion: \{ increment: 1 \} \}/);
    assert.match(mfa, /await rotateSessions\(req, reply, now\)/);
    assert.match(mfa, /await rotateSessions\(req, reply, null\)/);
  });
  it("todas las rutas MFA tienen límite de frecuencia", () => {
    const routes = [...mfa.matchAll(/app\.post\(\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(routes.sort(), ["/cancel", "/disable", "/enroll/confirm", "/enroll/start", "/recovery-codes", "/step-up", "/verify"].sort());
    for (const r of routes.filter((r) => r !== "/cancel")) {
      const seg = mfa.slice(mfa.indexOf(`"${r}"`), mfa.indexOf(`"${r}"`) + 250);
      assert.match(seg, /limit\(\d+, "/, r);
    }
  });
  it("step-up (§8.2) en acciones sensibles del personal", () => {
    assert.match(read("src/routes/users.ts"), /const sensitive = \[app\.requirePermission\("user:manage"\), app\.requireRecentMfa\]/);
    assert.match(read("src/routes/users.ts"), /"\/:id\/mfa\/reset", \{ preHandler: sensitive/);
    assert.match(read("src/routes/invitations.ts"), /app\.post\("\/", \{ preHandler: \[manage, app\.requireRecentMfa\] \}/);
    assert.match(read("src/routes/access.ts"), /"\/issue", \{ preHandler: \[manage, app\.requireRecentMfa\] \}/);
    assert.match(read("src/routes/persons.ts"), /"\/:id\/merge", \{ preHandler: \[app\.requirePermission\("participant:manage"\), app\.requireRecentMfa\] \}/);
  });
});

describe("A6: migración", () => {
  const sql = read("prisma/migrations/20261012000000_staff_mfa/migration.sql");
  it("aditiva (sin DROP ni DELETE) y con CHECK de coherencia", () => {
    assert.doesNotMatch(sql, /\bDROP\b|\bDELETE FROM\b|\bTRUNCATE\b|\bUPDATE "/i);
    assert.match(sql, /User_mfa_enabled_has_secret/);
    assert.match(sql, /User_mfa_staff_only/);
    assert.match(sql, /CREATE UNIQUE INDEX "MfaRecoveryCode_codeHash_key"/);
  });
});
