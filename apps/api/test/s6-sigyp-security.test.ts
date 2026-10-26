/**
 * S6 — Seguridad de la integración SIGyP (decisiones D1–D4 del 2026-10-26). Sin base de datos: esquemas, alcances,
 * permisos y reglas verificadas sobre la fuente. El comportamiento contra una base real (contraseña, rol, alcances,
 * auditoría) está en .e2e-local/e2e-sigyp-seguridad.mjs y la concurrencia de los límites en PostgreSQL real en
 * .e2e-local/concurrencia-limites.mjs.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GRANTABLE_PERMISSIONS, ROLE_PERMISSIONS, SIGYP_DEFAULT_SCOPES, SIGYP_SCOPES, sigypAllowedAudiences, sigypClientCreateSchema,
  sigypLinkCodeCreateSchema, sigypReauthSchema,
} from "@peregrinos/shared";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const adm = read("src/routes/organizationIntegrations.ts");
const sig = read("src/routes/sigypIntegration.ts");
const route = (src: string, start: string, end: string) => src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start) + start.length));

describe("S6/D1: reautenticación con contraseña", () => {
  it("esquemas: la contraseña es obligatoria y no se aceptan campos de más", () => {
    assert.equal(sigypLinkCodeCreateSchema.safeParse({ scopes: ["notices:send"] }).success, false);
    assert.equal(sigypLinkCodeCreateSchema.safeParse({ scopes: ["notices:send"], password: "" }).success, false);
    assert.equal(sigypLinkCodeCreateSchema.safeParse({ scopes: ["notices:send"], password: "x" }).success, true);
    assert.equal(sigypLinkCodeCreateSchema.safeParse({ scopes: ["notices:send"], password: "x", organizationId: "otra" }).success, false);
    assert.equal(sigypReauthSchema.safeParse({}).success, false);
    assert.equal(sigypReauthSchema.safeParse({ password: "x".repeat(129) }).success, false);
  });
  it("crear código, crear credencial y liberar el perfil verifican la contraseña en el servidor; revocar no", () => {
    for (const [start, end, purpose] of [
      ['app.post("/", {', 'app.post("/link-codes"', "sigyp:client:create"],
      ['app.post("/link-codes", {', 'app.get("/link-codes"', "sigyp:link-code:create"],
      ['app.post("/release-profile"', "\n}", "sigyp:profile:release"],
    ] as const) assert.match(route(adm, start, end), new RegExp(`assertPasswordReauth\\(req, password, "${purpose}"\\)`), purpose);
    for (const r of [route(adm, 'app.post("/link-codes/:id/revoke"', 'app.post("/:id/revoke"'), route(adm, 'app.post("/:id/revoke"', 'app.post("/release-profile"')]) {
      assert.doesNotMatch(r, /assertPasswordReauth/, "revocar debe poder hacerse en el acto");
    }
  });
  it("la verificación usa la cuenta autenticada en ESA petición, audita el fallo sin la contraseña y no deja permisos reutilizables", () => {
    const r = read("src/lib/reauth.ts");
    assert.match(r, /where: \{ id: req\.auth\.id \}/);
    assert.match(r, /verifyPassword\(user\.passwordHash, password\)/);
    assert.match(r, /action: "REAUTH_FAILED"[^\n]*metadata: \{ purpose \}/);
    assert.doesNotMatch(r, /metadata: \{[^}]*password/);
    assert.doesNotMatch(r, /console\.|log\.(info|warn|error|debug)|setCookie|jwt\.sign/, "ni registros ni tokens de reautenticación");
  });
  it("las rutas que piden la contraseña tienen límite de frecuencia", () => {
    for (const start of ['app.post("/", {', 'app.post("/link-codes", {', 'app.post("/release-profile"']) {
      assert.match(adm.slice(adm.indexOf(start), adm.indexOf("async (req", adm.indexOf(start))), /rateLimit: \{ max: 10/, start);
    }
  });
});

describe("S6/D2: conceder acceso es solo del SUPERADMIN, con alcances explícitos", () => {
  it("esquemas: alcances obligatorios, válidos y sin repetir", () => {
    const pw = { password: "x" };
    assert.equal(sigypClientCreateSchema.safeParse({ ...pw }).success, false, "sin alcances");
    assert.equal(sigypClientCreateSchema.safeParse({ ...pw, scopes: [] }).success, false);
    assert.equal(sigypClientCreateSchema.safeParse({ ...pw, scopes: ["admin:all"] }).success, false);
    assert.equal(sigypClientCreateSchema.safeParse({ ...pw, scopes: ["profile:write", "profile:write"] }).success, false);
    assert.equal(sigypClientCreateSchema.safeParse({ ...pw, scopes: ["profile:write"] }).success, true);
  });
  it("ambas rutas que conceden exigen SUPERADMIN antes de leer el cuerpo y auditan el intento rechazado", () => {
    assert.match(adm, /async function requireOwner[\s\S]*?if \(req\.auth\.role === "SUPERADMIN"\) return;[\s\S]*?action: "SIGYP_GRANT_DENIED"/);
    for (const [start, end, act] of [['app.post("/", {', 'app.post("/link-codes"', "client:create"], ['app.post("/link-codes", {', 'app.get("/link-codes"', "link-code:create"]] as const) {
      const r = route(adm, start, end);
      assert.ok(r.indexOf(`requireOwner(req, "${act}")`) > 0 && r.indexOf(`requireOwner(req, "${act}")`) < r.indexOf(".parse(req.body"), act);
    }
  });
  it("ninguna ruta concede todos los alcances por defecto: se guardan los elegidos", () => {
    assert.doesNotMatch(adm, /\[\.\.\.SIGYP_SCOPES\]/);
    assert.match(adm, /tokenHash: t\.hash, tokenHint: t\.hint, scopes, createdById: req\.auth\.id/);
    assert.match(adm, /codeHash: hash, scopes, createdById: req\.auth\.id/);
    // Al completar la vinculación, la credencial recibe exactamente los alcances del código.
    assert.match(sig, /scopes: code\.scopes, createdById: code\.createdById/);
  });
  it("la propuesta inicial de la pantalla no incluye los avisos al personal", () => {
    assert.ok(!SIGYP_DEFAULT_SCOPES.includes("notices:staff"));
    assert.ok(SIGYP_SCOPES.includes("notices:staff"));
  });
});

describe("S6/D3: avisos al personal con un permiso propio", () => {
  it("SIGyP: seguidores con notices:send; personal solo con notices:staff", () => {
    assert.deepEqual(sigypAllowedAudiences(["notices:send"]), ["FOLLOWERS"]);
    assert.deepEqual(sigypAllowedAudiences(["notices:staff"]), ["STAFF:SUPERADMIN", "STAFF:ADMIN", "STAFF:OPERATOR"]);
    assert.deepEqual(sigypAllowedAudiences(["notices:send", "notices:staff"]).length, 4);
    assert.deepEqual(sigypAllowedAudiences(["profile:write", "events:write"]), []);
  });
  it("SIGyP: el envío rechaza y audita los grupos no concedidos ANTES de crear el aviso", () => {
    const r = route(sig, 'app.post("/notices/:sourceId"', "\n}");
    const deny = r.indexOf('action: "SIGYP_NOTICE_DENIED"');
    assert.ok(deny > 0 && deny < r.indexOf("notifyAudiences("));
    assert.match(r, /AUDIENCE_NOT_ALLOWED/);
    assert.match(route(sig, 'app.get("/notices/audiences"', 'app.post("/notices/:sourceId"'), /resolveAudiences\(prisma, c\.organizationId, allowed\)/, "los recuentos son solo de los grupos permitidos");
  });
  it("panel: notice:staff es del SUPERADMIN, se puede conceder y no lo tienen ADMIN ni OPERATOR por su nivel", () => {
    assert.ok(ROLE_PERMISSIONS.SUPERADMIN.has("notice:staff"));
    assert.ok(!ROLE_PERMISSIONS.ADMIN.has("notice:staff") && !ROLE_PERMISSIONS.OPERATOR.has("notice:staff"));
    assert.ok((GRANTABLE_PERMISSIONS as readonly string[]).includes("notice:staff"));
    const org = read("src/routes/organization.ts");
    assert.match(org, /action: "NOTIFICATION_DENIED"/);
  });
});

describe("S6/D4: límites concurrentes", () => {
  it("bloqueo de la fila de la organización (FOR UPDATE) antes de contar, en la misma transacción", () => {
    assert.match(read("src/lib/integrationLimits.ts"), /SELECT "id" FROM "Organization" WHERE "id" = \$\{organizationId\} FOR UPDATE/);
    for (const [src, start, end] of [
      [adm, 'app.post("/", {', 'app.post("/link-codes"'],
      [adm, 'app.post("/link-codes", {', 'app.get("/link-codes"'],
      [sig, 'app.post("/link/complete"', 'app.post("/unlink"'],
    ] as const) {
      const r = route(src, start, end);
      const tx = r.indexOf("prisma.$transaction(");
      const lock = r.indexOf("await lockOrganization(tx,");
      const count = r.search(/tx\.integration(Client|LinkCode)\.count\(/);
      const create = r.search(/tx\.integration(Client|LinkCode)\.(create|updateMany)\(/);
      assert.ok(tx > 0 && lock > tx && count > lock && create > count, start);
    }
  });
});
