/**
 * A5.2 — Cierre de las sesiones del peregrino y reemplazo de la sesión de evento (/p). Sin base de datos: las funciones
 * de lib/session.ts reciben un cliente falso que registra lo que se le pide; las rutas se fijan por la fuente; la web
 * (lib/pilgrimLogout.ts) se prueba con `fetch` simulado. El comportamiento contra una base real está en
 * .e2e-local/e2e-sesiones.mjs.
 */
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-0123";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { revokePilgrimAccount, revokePilgrimEventSession, revokeReplacedPilgrimSession } from "../src/lib/session";
import { closeBrowserSessions } from "../../web/src/lib/pilgrimLogout";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

type Call = { where: Record<string, unknown>; data: Record<string, unknown> };
function fakeDb(count: number) {
  const calls: Call[] = [];
  const updateMany = async (a: Call) => { calls.push(a); return { count }; };
  return { calls, db: { user: { updateMany }, pilgrimSession: { updateMany } } as never };
}

describe("A5.2: revocación (lib/session.ts)", () => {
  it("cuenta: incremento condicional sobre la versión del token; true solo si cerró ahora", async () => {
    const a = fakeDb(1);
    assert.equal(await revokePilgrimAccount(a.db, { sub: "u1", sv: 3 }), true);
    assert.deepEqual(a.calls[0].where, { id: "u1", accountType: "PILGRIM", sessionVersion: 3 });
    assert.deepEqual(a.calls[0].data, { sessionVersion: { increment: 1 } });
    const b = fakeDb(0); // ya cerrada (otra versión) o no es PILGRIM
    assert.equal(await revokePilgrimAccount(b.db, { sub: "u1", sv: 3 }), false);
  });

  it("evento: solo la sesión del token presentado (por su hash), nunca las demás", async () => {
    const a = fakeDb(1);
    assert.equal(await revokePilgrimEventSession(a.db, "tok-1"), true);
    assert.deepEqual(a.calls[0].where, { tokenHash: sha("tok-1"), revokedAt: null });
    assert.ok(a.calls[0].data.revokedAt instanceof Date);
    const none = fakeDb(1);
    assert.equal(await revokePilgrimEventSession(none.db, undefined), false);
    assert.equal(none.calls.length, 0, "sin cookie no se toca la base");
  });

  it("reemplazo: solo la sesión vigente del token anterior; sin token no se revoca nada", async () => {
    const a = fakeDb(1);
    assert.equal(await revokeReplacedPilgrimSession(a.db, "viejo"), true);
    const w = a.calls[0].where as { tokenHash: string; revokedAt: null; expiresAt: { gt: Date } };
    assert.equal(w.tokenHash, sha("viejo"));
    assert.equal(w.revokedAt, null);
    assert.ok(w.expiresAt.gt instanceof Date);
    assert.deepEqual(Object.keys(w).sort(), ["expiresAt", "revokedAt", "tokenHash"], "sin filtros por persona: no alcanza a otros dispositivos");
    const none = fakeDb(1);
    assert.equal(await revokeReplacedPilgrimSession(none.db, undefined), false);
    assert.equal(none.calls.length, 0);
  });
});

describe("A5.2: rutas (fuente)", () => {
  const pilgrim = read("src/routes/pilgrim.ts");
  const auth = read("src/routes/auth.ts");

  it("logout-browser: las dos revocaciones y la auditoría en UNA transacción; las cookies se borran después", () => {
    const r = pilgrim.slice(pilgrim.indexOf('"/logout-browser"'));
    const tx = r.indexOf("prisma.$transaction(");
    assert.ok(tx > 0);
    assert.ok(r.indexOf("revokePilgrimAccount(tx, account)") > tx);
    assert.ok(r.indexOf("revokePilgrimEventSession(tx, raw)") > tx);
    assert.ok(r.indexOf("auditTx(tx, req, pilgrimLogoutAudit(") > tx);
    const end = r.indexOf("});", r.indexOf("return { accountClosed, eventRevoked };"));
    assert.ok(r.indexOf("clearPilgrimAccountSession(reply)") > end && r.indexOf("clearPilgrimEventSession(reply)") > end);
    assert.match(r, /reply\.header\("Cache-Control", "no-store"\)/);
  });

  it("acceso por /p: la sesión nueva y la revocación de la reemplazada en UNA transacción, después de validar", () => {
    const l = pilgrim.slice(pilgrim.indexOf('app.post("/login"'), pilgrim.indexOf('app.get("/me"'));
    const valid = l.indexOf("throw unauthorized(");
    const tx = l.indexOf("prisma.$transaction(");
    assert.ok(valid > 0 && tx > valid, "primero se valida el enlace o código");
    assert.ok(l.indexOf("tx.pilgrimSession.create(") > tx);
    assert.ok(l.indexOf("revokeReplacedPilgrimSession(tx, req.cookies[PILGRIM_COOKIE])") > tx);
    assert.ok(l.indexOf("reply.setCookie(PILGRIM_COOKIE") > l.indexOf("revokeReplacedPilgrimSession("), "la cookie nueva solo tras confirmar");
  });

  it("/auth/account/logout no borra la cookie de evento (su ruta no llega aquí y no podría revocarse)", () => {
    const lo = auth.slice(auth.indexOf('"/account/logout"'), auth.indexOf('"/password"'));
    assert.doesNotMatch(lo, /clearPilgrimEventSession|PILGRIM_COOKIE\b/);
  });

  it("las rutas de cierre siguen exigiendo el encabezado CSRF (POST fuera de la excepción de SIGyP)", () => {
    assert.match(pilgrim, /app\.post\("\/logout-browser"/);
    assert.doesNotMatch(read("src/app.ts"), /logout-browser/);
  });
});

describe("A5.2: web — closeBrowserSessions", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  let calls: string[] = [];
  function respond(plan: Record<string, number | "network">) {
    calls = [];
    g.fetch = async (url: string) => {
      const key = Object.keys(plan).find((k) => String(url).endsWith(k));
      calls.push(key ?? String(url));
      const st = key ? plan[key] : 500;
      if (st === "network") throw new TypeError("failed to fetch");
      return new Response(st === 204 ? null : JSON.stringify(st < 300 ? { accountClosed: true, eventRevoked: true } : { code: "X", message: "x" }), {
        status: st, headers: { "content-type": "application/json" },
      });
    };
  }
  afterEach(() => { delete g.fetch; });

  it("API nueva: una sola petición y éxito", async () => {
    respond({ "/pilgrim/logout-browser": 200 });
    assert.equal(await closeBrowserSessions(), true);
    assert.deepEqual(calls, ["/pilgrim/logout-browser"]);
  });

  it("API anterior (404): evento primero y, solo si se confirmó, la cuenta", async () => {
    respond({ "/pilgrim/logout-browser": 404, "/pilgrim/logout": 204, "/auth/account/logout": 204 });
    assert.equal(await closeBrowserSessions(), true);
    assert.deepEqual(calls, ["/pilgrim/logout-browser", "/pilgrim/logout", "/auth/account/logout"]);
  });

  it("404 y falla el cierre del evento: no se intenta el de la cuenta y no hay éxito", async () => {
    respond({ "/pilgrim/logout-browser": 404, "/pilgrim/logout": 500, "/auth/account/logout": 204 });
    assert.equal(await closeBrowserSessions(), false);
    assert.deepEqual(calls, ["/pilgrim/logout-browser", "/pilgrim/logout"]);
  });

  it("error del servidor o de red en la API nueva: no hay éxito ni se cae a los cierres anteriores", async () => {
    respond({ "/pilgrim/logout-browser": 500 });
    assert.equal(await closeBrowserSessions(), false);
    assert.deepEqual(calls, ["/pilgrim/logout-browser"]);
    respond({ "/pilgrim/logout-browser": "network" });
    assert.equal(await closeBrowserSessions(), false);
    // Sin red, la web solo despierta la API (/api/health); ningún otro cierre.
    assert.deepEqual(calls.filter((c) => c !== "/pilgrim/logout-browser" && !c.endsWith("/api/health")), []);
  });
});
