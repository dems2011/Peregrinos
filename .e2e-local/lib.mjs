import fs from "node:fs";

export const BASE = "http://127.0.0.1:4555/api";
let ok = 0, fail = 0;
export function check(name, cond, extra) {
  if (cond) { ok++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra !== undefined ? " → " + JSON.stringify(extra).slice(0, 400) : ""}`); }
}
export function done(label) {
  console.log(`\n${label}: ${ok} OK, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

/** Cliente con su propio frasco de cookies (cada actor es un navegador distinto). */
let ipSeq = 10;
export function client() {
  const ip = `10.9.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
  const jar = new Map();
  const c = {
    jar,
    async req(method, url, body) {
      const headers = { "x-pg-client": "web", "x-forwarded-for": ip };
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      if (body !== undefined) headers["content-type"] = "application/json";
      const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const sc of res.headers.getSetCookie()) {
        const [kv, ...attrs] = sc.split(";");
        const i = kv.indexOf("=");
        const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
        const expired = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a) || /max-age=0/i.test(a.trim()));
        if (!v || expired) jar.delete(k); else jar.set(k, v);
      }
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = text; }
      return { status: res.status, body: json, headers: res.headers };
    },
    get: (u) => c.req("GET", u),
    post: (u, b) => c.req("POST", u, b ?? {}),
    patch: (u, b) => c.req("PATCH", u, b ?? {}),
  };
  return c;
}

export async function staff(email, password = "Peregrinos2026!") {
  const c = client();
  const r = await c.post("/auth/login", { email, password });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Último correo (modo sin SMTP, solo fuera de producción) enviado a `to` que contenga `marker`. */
export async function mailLink(to, marker) {
  for (let i = 0; i < 40; i++) {
    const log = fs.readFileSync(process.env.API_LOG, "utf8");
    const blocks = log.split("[correo no configurado] Para: ").slice(1).filter((b) => b.startsWith(to));
    const hit = blocks.reverse().find((b) => b.includes(marker));
    if (hit) {
      const m = hit.match(new RegExp(`https?://\\S*${marker.replace(/[?#]/g, "\\$&")}\\S*`));
      if (m) return m[0];
    }
    await sleep(150);
  }
  return null;
}
export async function mailCount(to) {
  await sleep(400);
  return fs.readFileSync(process.env.API_LOG, "utf8").split("[correo no configurado] Para: ").slice(1).filter((b) => b.startsWith(to)).length;
}
export const tokenFrom = (url, key = "token") => decodeURIComponent(url.split(`${key}=`)[1]);
