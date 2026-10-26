/**
 * CSP de la web con navegador real, en los DOS modos, contra una web local y la API local de prueba (arnés PGlite de
 * .e2e-local o cualquier API en 127.0.0.1). Nunca contra producción: las peticiones a orígenes externos (mapas de
 * OpenStreetMap, YouTube, example.com) se INTERCEPTAN y se responden localmente; no sale tráfico a Internet.
 *
 *   node scripts/csp-navegador.mjs            (requiere la web compilada con API_URL=http://127.0.0.1:4555 y la API arriba)
 *   bash .e2e-local/run.sh ../scripts/csp-navegador.mjs api-csp.log      (levanta base PGlite + API y ejecuta esto)
 *
 * enforce:     páginas públicas y del personal sin violaciones, nonce en todos los scripts, nonce distinto por respuesta;
 *              permitido: fetch(blob:) (puente de descargas de Android), worker de blob: (lector QR), mosaicos de OSM,
 *              iframe de YouTube; bloqueado: manejador en línea inyectado, imagen de un origen no autorizado.
 * report-only: mismas páginas; lo que en enforce se bloquea aquí SE EJECUTA y solo se informa en la consola
 *              (el modo informe no cambia el comportamiento).
 * Navegador: puppeteer-core (PUPPETEER_CORE=<package.json de una carpeta donde esté instalado>, fuera del repositorio)
 * y Chrome/Edge. Credencial: la semilla local del arnés (SEED_PASSWORD, que exporta run.sh).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WEB_DIR = join(ROOT, "apps", "web");
if (!process.env.PUPPETEER_CORE) throw new Error("Falta PUPPETEER_CORE (package.json de una carpeta con puppeteer-core instalado)");
if (!process.env.SEED_PASSWORD) throw new Error("Falta SEED_PASSWORD (usar .e2e-local/run.sh)");
const puppeteer = createRequire(process.env.PUPPETEER_CORE)("puppeteer-core");
const CHROME = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => p && existsSync(p));
const PORT = 3000, WEB = `http://localhost:${PORT}`;
const API = "http://127.0.0.1:4555/api/health";
const PUBLIC = ["/login", "/parroquias", "/cuenta/ingresar", "/cuenta/registro", "/solicitud-parroquia", "/no-existe"];
const STAFF = ["/", "/evento", "/personas", "/pagos", "/avisos", "/configuracion", "/configuracion/parroquia", "/configuracion/seguridad", "/credenciales", "/voluntarios", "/historial", "/menu", "/registrar"];
const EXTERNAL = /^https:\/\/(tile\.openstreetmap\.org|www\.youtube-nocookie\.com|www\.youtube\.com|example\.com)\//;
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

let ok = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); } };

async function startWeb(mode) {
  const next = createRequire(join(WEB_DIR, "package.json")).resolve("next/dist/bin/next");
  const web = spawn(process.execPath, [next, "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: WEB_DIR, env: { ...process.env, CSP_MODE: mode, NODE_ENV: "production" } });
  web.log = ""; web.stdout.on("data", (d) => (web.log += d)); web.stderr.on("data", (d) => (web.log += d));
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${WEB}/login`)).ok) return web; } catch { /* arrancando */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`La web no arrancó en modo ${mode}:\n${web.log.slice(-800)}`);
}

async function runMode(mode) {
  console.log(`\nModo ${mode}`);
  const header = mode === "enforce" ? "content-security-policy" : "content-security-policy-report-only";
  const web = await startWeb(mode);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run"] });
  const violations = [];
  const external = [];
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = req.url();
      if (EXTERNAL.test(u)) { external.push(u); return req.respond(u.endsWith(".png") ? { status: 200, contentType: "image/png", body: PNG_1PX } : { status: 200, contentType: "text/html", body: "<!doctype html><title>externo simulado</title>" }); }
      if (/^https?:\/\//.test(u) && !u.startsWith(WEB) && !u.startsWith("http://127.0.0.1")) { external.push(u); return req.abort(); }
      return req.continue();
    });
    await page.evaluateOnNewDocument(() => {
      document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP_VIOLATION ${e.violatedDirective} ${e.blockedURI || "(en línea)"} en ${location.pathname}`));
    });
    page.on("console", (m) => { const t = m.text(); if (t.startsWith("CSP_VIOLATION") || /Content Security Policy/i.test(t)) violations.push(t.slice(0, 250)); });

    const visit = async (path) => {
      const resp = await page.goto(WEB + path, { waitUntil: "load", timeout: 60_000 });
      await new Promise((r) => setTimeout(r, 2000)); // hidratación y datos (algunas pantallas mantienen una conexión abierta)
      const csp = resp.headers()[header] ?? "";
      const other = resp.headers()[mode === "enforce" ? "content-security-policy-report-only" : "content-security-policy"];
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      const scripts = await page.$$eval("script", (ss) => ss.map((s) => s.nonce));
      check(`${path}: ${resp.status()}, cabecera ${mode} (y no la otra), nonce en ${scripts.length} scripts`, resp.status() < 500 && !!nonce && !other && scripts.every((n) => n === nonce), { status: resp.status(), other: !!other });
      return nonce;
    };

    const n1 = await visit("/login"), n2 = await visit("/login");
    check("nonce distinto en cada respuesta", n1 && n2 && n1 !== n2);
    for (const p of PUBLIC.slice(1)) await visit(p);
    const login = await page.evaluate(async (pwd) => (await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-pg-client": "web" }, body: JSON.stringify({ email: "superadmin@peregrinos.local", password: pwd }) })).status, process.env.SEED_PASSWORD);
    check("ingreso del personal (semilla local del arnés)", login === 200, login);
    for (const p of STAFF) await visit(p);
    check("sin violaciones de CSP en las páginas visitadas", violations.length === 0, violations.slice(0, 8));

    if (mode === "enforce") {
      // Tarjeta de SIGyP (D1–D3): alcances explícitos (todo menos el personal, marcado por defecto) y contraseña.
      await visit("/configuracion/parroquia");
      const card = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('[data-testid="sigyp-scopes"] input[type="checkbox"]')];
        const card = document.querySelector('[data-testid="sigyp-card"]');
        return { boxes: boxes.length, checked: boxes.filter((b) => b.checked).length, pwd: !!card?.querySelector('input[type="password"][autocomplete="current-password"]') };
      });
      check("tarjeta SIGyP: 5 alcances, 4 marcados (sin el personal) y campo de contraseña", card.boxes === 5 && card.checked === 4 && card.pwd, card);
      if (process.env.SCREENSHOT_DIR) {
        for (const [w, h, name] of [[1366, 900, "escritorio"], [390, 844, "movil"]]) {
          await page.setViewport({ width: w, height: h });
          await page.evaluate(() => document.querySelector('[data-testid="sigyp-card"]')?.scrollIntoView());
          await new Promise((r) => setTimeout(r, 500));
          await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, `sigyp-card-${name}.png`) });
        }
        await page.setViewport({ width: 1366, height: 900 });
      }
    }

    // Recursos que la aplicación necesita: deben funcionar en los dos modos y sin violaciones.
    const before = violations.length;
    const needs = await page.evaluate(async () => {
      const blobUrl = URL.createObjectURL(new Blob(["%PDF-1.4 prueba"], { type: "application/pdf" }));
      const fetched = await fetch(blobUrl).then((r) => r.text()).catch((e) => `error ${e}`);
      const worker = await new Promise((res) => {
        try { const w = new Worker(URL.createObjectURL(new Blob(["postMessage('listo')"], { type: "text/javascript" }))); w.onmessage = (e) => res(e.data); w.onerror = () => res("error"); setTimeout(() => res("sin respuesta"), 3000); } catch (e) { res(`error ${e}`); }
      });
      const tile = await new Promise((res) => { const i = new Image(); i.onload = () => res("cargó"); i.onerror = () => res("error"); i.src = "https://tile.openstreetmap.org/3/4/2.png"; });
      const frame = await new Promise((res) => { const f = document.createElement("iframe"); f.onload = () => res("cargó"); f.src = "https://www.youtube-nocookie.com/embed/prueba"; document.body.appendChild(f); setTimeout(() => res("sin carga"), 4000); });
      return { fetched, worker, tile, frame };
    });
    await new Promise((r) => setTimeout(r, 500));
    check("descarga: fetch(blob:) permitido (puente de Android)", needs.fetched.startsWith("%PDF"), needs.fetched);
    check("lector QR: worker creado desde blob: permitido", needs.worker === "listo", needs.worker);
    check("mapa: mosaico de tile.openstreetmap.org permitido (respuesta simulada)", needs.tile === "cargó", needs.tile);
    check("transmisión: iframe de youtube-nocookie permitido (respuesta simulada)", needs.frame === "cargó", needs.frame);
    check("esos recursos no generan violaciones", violations.length === before, violations.slice(before));

    // Lo que la política no permite: en enforce se bloquea; en report-only se ejecuta y solo se informa.
    await visit("/login");
    const ran = await page.evaluate(async () => {
      window.__inyectado = false;
      const d = document.createElement("div");
      d.innerHTML = `<img src="data:," onerror="window.__inyectado=true"><img src="https://example.com/x.png">`;
      document.body.appendChild(d);
      await new Promise((r) => setTimeout(r, 1500));
      return window.__inyectado;
    });
    await new Promise((r) => setTimeout(r, 500));
    const reported = violations.slice(before).join("\n");
    if (mode === "enforce") {
      check("manejador en línea inyectado: bloqueado e informado", ran === false && /script-src/.test(reported), reported);
      check("imagen de origen no autorizado: bloqueada", /img-src[^\n]*example\.com/.test(reported) && !external.some((u) => u.includes("example.com")), reported);
    } else {
      check("report-only: el manejador en línea SE EJECUTA (no cambia el comportamiento) y se informa", ran === true && /script-src/.test(reported), reported);
      check("report-only: la imagen no autorizada se pide igual y se informa", /img-src[^\n]*example\.com/.test(reported) && external.some((u) => u.includes("example.com")), reported);
    }
    const leaked = external.filter((u) => !EXTERNAL.test(u));
    check("ninguna petición real salió a Internet", leaked.length === 0, leaked);
  } finally {
    await browser.close();
    web.kill();
    await new Promise((r) => web.once("exit", r));
  }
}

if (!CHROME) throw new Error("Hace falta Chrome o Edge");
try { await fetch(API); } catch { throw new Error(`La API de prueba no responde en ${API} (usar .e2e-local/run.sh)`); }
await runMode("enforce");
await runMode("report-only");
console.log(`\nCSP web: ${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
