/**
 * CSP de la web (apps/web/src/lib/csp.ts): nonce + strict-dynamic, sin comodines ni unsafe-inline en scripts, solo los
 * orígenes externos que la aplicación usa, y las excepciones que necesita la app Android (fetch de blob:). Sin base.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildCsp, cspHeaderName, cspMode, newNonce } from "../../web/src/lib/csp";

const parse = (csp: string) => Object.fromEntries(csp.split("; ").map((d) => { const [k, ...v] = d.split(" "); return [k, v]; }));

describe("S5: CSP de la web", () => {
  it("producción: scripts solo con nonce + strict-dynamic, sin eval ni comodines", () => {
    const nonce = newNonce();
    const all = buildCsp({ nonce, dev: false });
    const p = parse(all);
    assert.deepEqual(p["script-src"], ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
    assert.deepEqual(p["style-src"], ["'self'"]);
    assert.doesNotMatch(all, /unsafe-eval|\s\*|https?:\s|https:\/\/\*/);
    assert.doesNotMatch(p["script-src"].join(" "), /unsafe-inline/);
    for (const k of ["object-src", "base-uri", "frame-ancestors"]) assert.deepEqual(p[k], ["'none'"], k);
  });

  it("orígenes externos: solo los que usa la aplicación", () => {
    const p = parse(buildCsp({ nonce: newNonce(), dev: false }));
    const external = Object.values(p).flat().filter((v) => v.startsWith("https://"));
    assert.deepEqual(external.sort(), ["https://tile.openstreetmap.org", "https://www.youtube-nocookie.com", "https://www.youtube.com"]);
    // Cada origen permitido aparece en el código de la web (si se deja de usar, se quita de la política).
    const src = path.join(__dirname, "..", "..", "web", "src");
    const code: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.tsx?$/.test(e.name) && !f.endsWith("csp.ts")) code.push(fs.readFileSync(f, "utf8")); } };
    walk(src);
    for (const o of external) assert.ok(code.some((c) => c.includes(o)), `${o} no se usa en la web`);
  });

  it("app Android y lector de QR: fetch y worker de blob: permitidos", () => {
    const p = parse(buildCsp({ nonce: newNonce(), dev: false }));
    assert.ok(p["connect-src"].includes("blob:"), "MainActivity lee los PDF con fetch(blob:)");
    assert.ok(p["worker-src"].includes("blob:"), "qr-scanner crea su worker desde un blob");
  });

  it("desarrollo agrega solo eval y estilos en línea", () => {
    const p = parse(buildCsp({ nonce: newNonce(), dev: true }));
    assert.ok(p["script-src"].includes("'unsafe-eval'"));
    assert.ok(p["style-src"].includes("'unsafe-inline'"));
  });

  it("nonce aleatorio y validado; modo progresivo", () => {
    assert.notEqual(newNonce(), newNonce());
    assert.throws(() => buildCsp({ nonce: "abc'; script-src *", dev: false }));
    assert.equal(cspMode(undefined), "report-only", "por defecto solo informa");
    assert.equal(cspMode("enforce"), "enforce");
    assert.equal(cspMode("off"), "off");
    assert.equal(cspMode("cualquier cosa"), "report-only");
    assert.equal(cspHeaderName("enforce"), "Content-Security-Policy");
    assert.equal(cspHeaderName("report-only"), "Content-Security-Policy-Report-Only");
  });
});
