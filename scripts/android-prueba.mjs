/**
 * Variante de PRUEBA de la app Android («Peregrinos PRUEBA», com.peregrinos.app.prueba), compilada en una COPIA aislada.
 *
 * - Solo LEE android/ (sin seguimiento, del propietario): lo copia a una carpeta temporal y trabaja ahí.
 * - Aplica la identidad y el código nativo versionados (resources/android/res y resources/android/java).
 * - Exige --url explícita (no hay URL de pruebas por defecto) y rechaza la producción: la variante nunca escribe en
 *   producción. Ejemplos: http://10.0.2.2:3000 (emulador → esta PC), http://192.168.x.y:3000 (teléfono en la red).
 * - Sin google-services.json: la variante no se registra en el Firebase de producción (sin push).
 * - Paquete y nombre distintos: se instala al lado de la app real sin reemplazarla.
 *
 * Uso: node scripts/android-prueba.mjs --url http://10.0.2.2:3000 [--java <JDK 17-21>] [--conservar]
 * Resultado: APK de depuración en %TEMP%\peregrinos-prueba-<marca>\peregrinos-prueba-debug.apk (la copia se borra).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "android");
const url = arg("url");
const KEEP = process.argv.includes("--conservar");

const PRODUCTION = [/(^|\.)onrender\.com$/i, /(^|\.)peregrinos\.net\.ar$/i, /(^|\.)railway\.app$/i];
let u;
try { u = new URL(url ?? ""); } catch { throw new Error("Indicar --url (no hay URL de pruebas por defecto), p. ej. http://10.0.2.2:3000"); }
if (!["http:", "https:"].includes(u.protocol) || u.pathname !== "/" || u.search) throw new Error("--url debe ser un origen http(s) sin ruta");
if (PRODUCTION.some((re) => re.test(u.hostname))) throw new Error(`--url apunta a producción (${u.hostname}): la variante de prueba no puede escribir allí`);
if (!existsSync(join(SRC, "app", "build.gradle"))) throw new Error("No existe android/ (proyecto nativo)");

const java = arg("java") ?? [join(homedir(), ".jdks", "jdk-21.0.12.1+1"), join(homedir(), ".jdks", "jbr-21.0.11")].find((d) => existsSync(join(d, "bin", "java.exe")));
if (!java) throw new Error("Hace falta un JDK 17–21 (--java); Gradle 8.14 no corre sobre el JDK 25 de Android Studio");

const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const OUT = join(tmpdir(), `peregrinos-prueba-${stamp}`);
const WORK = join(OUT, "android");
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const treeHash = (dir) => {
  const h = createHash("sha256");
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else h.update(p.slice(dir.length)).update(readFileSync(p)); } };
  walk(dir);
  return h.digest("hex");
};

const before = treeHash(SRC);
console.log(`android/ (solo lectura) huella=${before.slice(0, 16)}…`);
const skip = new Set(["build", ".gradle", ".idea", "app-installed.apk", "google-services.json", "local.properties"]);
cpSync(SRC, WORK, { recursive: true, filter: (p) => !skip.has(p.split(/[\\/]/).pop()) || p === SRC });
// local.properties (ruta del SDK) se copia aparte: no se muestra.
if (existsSync(join(SRC, "local.properties"))) cpSync(join(SRC, "local.properties"), join(WORK, "local.properties"));
cpSync(join(ROOT, "resources", "android", "res"), join(WORK, "app", "src", "main", "res"), { recursive: true });
cpSync(join(ROOT, "resources", "android", "java"), join(WORK, "app", "src", "main", "java"), { recursive: true });

// Los módulos de Capacitor se referencian como ../node_modules/...: se copian también a la carpeta temporal para que
// Gradle compile ahí (y no escriba build/ dentro de node_modules del repositorio).
{
  const settings = join(WORK, "capacitor.settings.gradle");
  let g = readFileSync(settings, "utf8");
  g = g.replace(/new File\('\.\.\/(node_modules\/[^']+)'\)/g, (_, rel) => {
    const from = join(ROOT, rel);
    const to = join(OUT, rel);
    if (!existsSync(from)) throw new Error(`Falta ${rel} (npm install)`);
    cpSync(from, to, { recursive: true, filter: (p) => basename(p) !== "build" });
    return `new File('${to.split(sep).join("/")}')`;
  });
  writeFileSync(settings, g);
}
const edit = (rel, fn) => { const f = join(WORK, rel); writeFileSync(f, fn(readFileSync(f, "utf8"))); };
const PKG = "com.peregrinos.app.prueba";
edit("app/build.gradle", (s) => {
  if (!s.includes('applicationId "com.peregrinos.app"')) throw new Error("applicationId inesperado en build.gradle");
  return s.replace('applicationId "com.peregrinos.app"', `applicationId "${PKG}"`);
});
edit("app/src/main/res/values/strings.xml", (s) => s
  .replace(/<string name="app_name">[^<]*<\/string>/, '<string name="app_name">Peregrinos PRUEBA</string>')
  .replace(/<string name="title_activity_main">[^<]*<\/string>/, '<string name="title_activity_main">Peregrinos PRUEBA</string>')
  .replace(/<string name="package_name">[^<]*<\/string>/, `<string name="package_name">${PKG}</string>`)
  .replace(/<string name="custom_url_scheme">[^<]*<\/string>/, `<string name="custom_url_scheme">${PKG}</string>`));
edit("app/src/main/assets/capacitor.config.json", (s) => {
  const c = JSON.parse(s);
  c.appId = PKG; c.appName = "Peregrinos PRUEBA";
  c.server = { ...c.server, url: u.origin, cleartext: u.protocol === "http:" };
  return JSON.stringify(c, null, "\t") + "\n";
});
if (u.protocol === "http:") {
  // HTTP solo en la variante de prueba (red local o emulador); la app real sigue solo con HTTPS.
  edit("app/src/main/AndroidManifest.xml", (s) => s.includes("usesCleartextTraffic") ? s : s.replace("<application", '<application\n        android:usesCleartextTraffic="true"'));
}

console.log(`Compilando ${PKG} → ${u.origin} (JDK ${java})…`);
const r = spawnSync(join(WORK, "gradlew.bat"), ["assembleDebug", "--offline", "--console=plain", "-q"], {
  cwd: WORK, env: { ...process.env, JAVA_HOME: java }, encoding: "utf8", shell: true, timeout: 1_200_000, // shell: .bat en Windows; argumentos fijos
});
const log = `${r.stdout ?? ""}${r.stderr ?? ""}`;
const apk = join(WORK, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const ok = r.status === 0 && existsSync(apk);
let final = null;
if (ok) { final = join(OUT, "peregrinos-prueba-debug.apk"); cpSync(apk, final); }
if (!KEEP) { rmSync(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); rmSync(join(OUT, "node_modules"), { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); }
const after = treeHash(SRC);
console.log(ok ? `APK: ${final}\nSHA-256: ${sha(final)}` : `FALLÓ la compilación:\n${log.slice(-3000)}`);
console.log(`android/ sin cambios: ${after === before}`);
process.exitCode = ok && after === before ? 0 : 1;
