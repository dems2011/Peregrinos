/**
 * APK CANDIDATA de producción de Peregrinos (com.peregrinos.app), compilada en una COPIA aislada de android/.
 *
 * - Solo LEE android/ (lo copia a una carpeta temporal; huella antes/después) y aplica el código nativo y los íconos
 *   versionados (resources/android/java y res), como la variante de prueba.
 * - Conserva el paquete, la URL de producción (https://peregrinos-1.onrender.com, de capacitor.config.ts) y el
 *   google-services.json de producción; exige que la URL sea HTTPS y de producción.
 * - Sube versionCode/versionName a los indicados (--version-code > el actual; nunca baja).
 * - Firma con la clave EXISTENTE (nunca crea una): lee la ruta del archivo .properties (--firma <archivo>), pasa los
 *   valores a Gradle por variables de entorno del proceso hijo (no por argumentos ni archivos) y no los muestra.
 *
 * Uso: node scripts/android-candidata.mjs --version-code 4 --version-name 1.2 --firma <peregrinos-release.properties>
 *      [--java <JDK 17-21>] [--salida <carpeta>]
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "android");
const PROD_URL = "https://peregrinos-1.onrender.com";
const PKG = "com.peregrinos.app";

const versionCode = Number(arg("version-code"));
const versionName = arg("version-name");
const firma = arg("firma");
if (!Number.isInteger(versionCode) || versionCode < 1 || !/^\d+\.\d+(\.\d+)?$/.test(versionName ?? "")) throw new Error("Indicar --version-code <entero> y --version-name <x.y>");
if (!firma || !existsSync(firma)) throw new Error("Indicar --firma <archivo .properties de la clave existente>");
const java = arg("java") ?? [join(homedir(), ".jdks", "jdk-21.0.12.1+1"), join(homedir(), ".jdks", "jbr-21.0.11")].find((d) => existsSync(join(d, "bin", "java.exe")));
if (!java) throw new Error("Hace falta un JDK 17–21 (--java)");

// Propiedades de firma: solo se validan los NOMBRES; los valores no se imprimen nunca.
const props = Object.fromEntries(readFileSync(firma, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
for (const k of ["storeFile", "storePassword", "keyAlias", "keyPassword"]) if (!props[k]) throw new Error(`Al archivo de firma le falta «${k}»`);
const storeFile = isAbsolute(props.storeFile) ? props.storeFile : resolve(dirname(firma), props.storeFile);
if (!existsSync(storeFile)) throw new Error("No se encuentra el almacén de claves indicado en el archivo de firma");

const gradle = readFileSync(join(SRC, "app", "build.gradle"), "utf8");
const current = Number(/versionCode (\d+)/.exec(gradle)?.[1]);
if (!(versionCode > current)) throw new Error(`versionCode ${versionCode} debe ser mayor que el actual (${current})`);
const cfg = JSON.parse(readFileSync(join(SRC, "app", "src", "main", "assets", "capacitor.config.json"), "utf8"));
if (cfg.appId !== PKG || cfg.server?.url !== PROD_URL || cfg.server?.cleartext) throw new Error("capacitor.config.json no es el de producción (paquete, URL https, sin HTTP)");
if (!existsSync(join(SRC, "app", "google-services.json"))) throw new Error("Falta google-services.json de producción (sin él no hay push)");

const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const OUT = join(tmpdir(), `peregrinos-candidata-${stamp}`);
const WORK = join(OUT, "android");
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const treeHash = (dir) => {
  const h = createHash("sha256");
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else h.update(p.slice(dir.length)).update(readFileSync(p)); } };
  walk(dir);
  return h.digest("hex");
};
const before = treeHash(SRC);
const skip = new Set(["build", ".gradle", ".idea", "app-installed.apk"]);
cpSync(SRC, WORK, { recursive: true, filter: (p) => !skip.has(p.split(/[\\/]/).pop()) || p === SRC });
cpSync(join(ROOT, "resources", "android", "res"), join(WORK, "app", "src", "main", "res"), { recursive: true });
cpSync(join(ROOT, "resources", "android", "java"), join(WORK, "app", "src", "main", "java"), { recursive: true });
{
  const settings = join(WORK, "capacitor.settings.gradle");
  writeFileSync(settings, readFileSync(settings, "utf8").replace(/new File\('\.\.\/(node_modules\/[^']+)'\)/g, (_, rel) => {
    const from = join(ROOT, rel), to = join(OUT, rel);
    if (!existsSync(from)) throw new Error(`Falta ${rel} (npm install)`);
    cpSync(from, to, { recursive: true, filter: (p) => basename(p) !== "build" });
    return `new File('${to.split(sep).join("/")}')`;
  }));
}
const g = join(WORK, "app", "build.gradle");
writeFileSync(g, readFileSync(g, "utf8").replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "${versionName}"`));

console.log(`Compilando ${PKG} ${versionName} (${versionCode}) → ${PROD_URL}, firmada con la clave existente…`);
// Firma inyectada por propiedades de proyecto de Gradle (ORG_GRADLE_PROJECT_*), solo en el entorno del proceso hijo.
const env = {
  ...process.env, JAVA_HOME: java,
  "ORG_GRADLE_PROJECT_android.injected.signing.store.file": storeFile,
  "ORG_GRADLE_PROJECT_android.injected.signing.store.password": props.storePassword,
  "ORG_GRADLE_PROJECT_android.injected.signing.key.alias": props.keyAlias,
  "ORG_GRADLE_PROJECT_android.injected.signing.key.password": props.keyPassword,
};
const r = spawnSync(join(WORK, "gradlew.bat"), ["assembleRelease", "--offline", "--console=plain", "-q"], { cwd: WORK, env, encoding: "utf8", shell: true, timeout: 1_800_000 });
const hide = (s) => [props.storePassword, props.keyPassword].reduce((acc, v) => acc.split(v).join("***"), s);
const apk = join(WORK, "app", "build", "outputs", "apk", "release", "app-release.apk");
const ok = r.status === 0 && existsSync(apk);
let final = null;
if (ok) {
  const dest = arg("salida") ?? OUT;
  mkdirSync(dest, { recursive: true });
  final = join(dest, `peregrinos-${versionName}-${versionCode}-candidata.apk`);
  cpSync(apk, final);
}
rmSync(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
rmSync(join(OUT, "node_modules"), { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
const after = treeHash(SRC);
console.log(ok ? `APK: ${final}\nSHA-256: ${sha(final)}` : `FALLÓ la compilación:\n${hide(`${r.stdout ?? ""}${r.stderr ?? ""}`).slice(-3000)}`);
console.log(`android/ sin cambios: ${after === before}`);
process.exitCode = ok && after === before ? 0 : 1;
