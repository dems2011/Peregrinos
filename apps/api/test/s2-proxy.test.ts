/**
 * Confianza en proxies: con saltos o lista fija, un X-Forwarded-For escrito por el cliente no cambia la IP que ve la API
 * (y por lo tanto no elude el límite de intentos). Sin base de datos.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { fastifyTrustProxy, parseTrustProxy, trustProxyWarning, type TrustProxy } from "../src/lib/proxy";

async function ipSeen(trustProxy: TrustProxy, remoteAddress: string, xff?: string) {
  const app = Fastify({ trustProxy: fastifyTrustProxy(trustProxy) });
  app.get("/ip", async (req) => ({ ip: req.ip }));
  const r = await app.inject({ method: "GET", url: "/ip", remoteAddress, headers: xff ? { "x-forwarded-for": xff } : {} });
  await app.close();
  return (r.json() as { ip: string }).ip;
}

describe("S2: confianza en proxies (TRUST_PROXY)", () => {
  it("interpreta la configuración y rechaza valores inválidos", () => {
    assert.equal(parseTrustProxy(undefined), true, "sin variable: se conserva el comportamiento vigente");
    assert.equal(parseTrustProxy("false"), false);
    assert.equal(parseTrustProxy("2"), 2);
    assert.equal(parseTrustProxy("10.0.0.0/8, 172.16.0.1"), "10.0.0.0/8,172.16.0.1");
    for (const bad of ["0", "11", "cualquiera", "10.0.0.1; rm", "*"]) assert.throws(() => parseTrustProxy(bad), bad);
  });
  it("true (lo vigente) cree un X-Forwarded-For falso: por eso no debe usarse en producción", async () => {
    assert.equal(await ipSeen(true, "10.0.0.5", "6.6.6.6, 203.0.113.9"), "6.6.6.6");
    assert.match(trustProxyWarning("production", true)!, /TRUST_PROXY/);
    assert.equal(trustProxyWarning("production", 2), null);
    assert.equal(trustProxyWarning("development", true), null);
  });
  it("con 1 salto (borde del alojamiento), la IP es la que agregó el proxy, no la que escribió el cliente", async () => {
    // El cliente manda "6.6.6.6"; el borde agrega la IP real 203.0.113.9; el socket es el borde (10.0.0.5).
    assert.equal(await ipSeen(1, "10.0.0.5", "6.6.6.6, 203.0.113.9"), "203.0.113.9");
  });
  it("con 2 saltos (dos proxies propios que agregan su entrada), igual: el valor falso del cliente se ignora", async () => {
    // cliente → proxy A (agrega 203.0.113.9) → proxy B (agrega 10.0.0.7) → API (socket 10.0.0.8).
    assert.equal(await ipSeen(2, "10.0.0.8", "6.6.6.6, 203.0.113.9, 10.0.0.7"), "203.0.113.9");
  });
  it("con lista de proxies propios: solo se cree el encabezado si el socket es uno de ellos", async () => {
    assert.equal(await ipSeen("10.0.0.0/8", "10.0.0.5", "203.0.113.9"), "203.0.113.9");
    assert.equal(await ipSeen("10.0.0.0/8", "198.51.100.4", "6.6.6.6"), "198.51.100.4", "conexión directa: se ignora el encabezado");
  });
  it("API pública + saltos: quien la llama directamente (sin pasar por la web) controla la IP — riesgo documentado", async () => {
    // Atacante → borde de la API (agrega su IP real 198.51.100.4) → API. Con 2 saltos se cree su valor inventado.
    assert.equal(await ipSeen(2, "10.0.0.5", "6.6.6.6, 198.51.100.4"), "6.6.6.6");
  });
  it("API pública + lista de proxies propios: la llamada directa no puede elegir su IP", async () => {
    // Por la web: borde de la web agrega 203.0.113.9; Next lo reenvía; el borde de la API agrega la salida de la web
    // (10.0.0.7). Directa: el borde de la API agrega la IP real del atacante.
    assert.equal(await ipSeen("10.0.0.0/8", "10.0.0.5", "6.6.6.6, 203.0.113.9, 10.0.0.7"), "203.0.113.9");
    assert.equal(await ipSeen("10.0.0.0/8", "10.0.0.5", "6.6.6.6, 198.51.100.4"), "198.51.100.4");
  });
  it("IPv6: lista CIDR y saltos funcionan igual (red privada solo IPv6, p. ej. Railway)", async () => {
    assert.equal(parseTrustProxy("fd00::/8, 10.0.0.0/8"), "fd00::/8,10.0.0.0/8");
    assert.equal(await ipSeen("fd00::/8", "fd00::5", "6.6.6.6, 2001:db8::1"), "2001:db8::1");
    assert.equal(await ipSeen("fd00::/8", "2001:db8::99", "6.6.6.6"), "2001:db8::99", "conexión directa IPv6: se ignora el encabezado");
    assert.equal(await ipSeen(1, "::1", "6.6.6.6, 2001:db8::2"), "2001:db8::2");
  });
  it("límite de frecuencia por IP: con el proxy fijado, cambiar el X-Forwarded-For no da intentos nuevos; con true sí", async () => {
    const hits = async (trust: TrustProxy) => {
      const app = Fastify({ trustProxy: fastifyTrustProxy(trust) });
      await app.register(rateLimit, { max: 2, timeWindow: "1 minute" });
      app.post("/login", async () => ({ ok: true }));
      const out: number[] = [];
      // Mismo cliente real (el borde agrega 203.0.113.9); en cada intento inventa otro X-Forwarded-For.
      for (const fake of ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4"]) {
        out.push((await app.inject({ method: "POST", url: "/login", remoteAddress: "10.0.0.5", headers: { "x-forwarded-for": `${fake}, 203.0.113.9` } })).statusCode);
      }
      await app.close();
      return out;
    };
    assert.deepEqual(await hits(1), [200, 200, 429, 429], "con 1 salto: el límite alcanza al cliente real");
    assert.deepEqual(await hits(true), [200, 200, 200, 200], "control: con true cada valor inventado es otra IP");
  });
  it("la API usa la configuración (no un true fijo) y advierte en producción", () => {
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "app.ts"), "utf8");
    assert.ok(app.includes("trustProxy: fastifyTrustProxy(cfg.TRUST_PROXY)"));
    assert.ok(!/trustProxy:\s*true/.test(app));
    assert.ok(app.includes("trustProxyWarning(cfg.NODE_ENV, cfg.TRUST_PROXY)"));
  });
  it("web: el inicio respeta PORT del alojamiento (sin -p fijo; 3000 por defecto)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "web", "package.json"), "utf8")) as { scripts: Record<string, string> };
    assert.equal(pkg.scripts.start, "next start");
  });
});
