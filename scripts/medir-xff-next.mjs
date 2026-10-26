// Medición empírica (D6): qué X-Forwarded-For recibe la API a través de la reescritura /api de Next (next start).
// Un eco ocupa el lugar de la API en 127.0.0.1:4555 (la URL con la que se compiló la web) y devuelve lo que recibió.
// Uso: compilar la web con API_URL=http://127.0.0.1:4555 (sin RENDER) y luego: node scripts/medir-xff-next.mjs apps/web
// Resultado del 2026-10-26 (Next 15.5.27): el encabezado llega TAL CUAL y Next no agrega ninguna entrada (lib/proxy.ts).
import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const WEB_DIR = process.argv[2];
const echo = http.createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ xff: req.headers["x-forwarded-for"] ?? null, xrealip: req.headers["x-real-ip"] ?? null, xfproto: req.headers["x-forwarded-proto"] ?? null, socket: req.socket.remoteAddress }));
});
await new Promise((r) => echo.listen(4555, "127.0.0.1", r));
const next = createRequire(path.join(WEB_DIR, "package.json")).resolve("next/dist/bin/next");
const web = spawn(process.execPath, [next, "start", "-p", "3000", "-H", "127.0.0.1"], { cwd: WEB_DIR, env: { ...process.env, NODE_ENV: "production", CSP_MODE: "off" } });
let log = ""; web.stdout.on("data", (d) => (log += d)); web.stderr.on("data", (d) => (log += d));
for (let i = 0; i < 120; i++) { try { await fetch("http://127.0.0.1:3000/api/health"); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

const ask = async (label, headers) => {
  const r = await fetch("http://127.0.0.1:3000/api/eco", { headers });
  console.log(label.padEnd(44), JSON.stringify(await r.json()));
};
console.log("Next", createRequire(path.join(WEB_DIR, "package.json"))("next/package.json").version);
await ask("cliente directo, sin X-Forwarded-For", {});
await ask("cliente con X-Forwarded-For: 203.0.113.7", { "x-forwarded-for": "203.0.113.7" });
await ask("como detrás de un borde: '6.6.6.6, 203.0.113.9'", { "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
web.kill(); echo.close();
await new Promise((r) => web.once("exit", r));
