/**
 * Íconos de Peregrinos a partir del ÍCONO OFICIAL del propietario (CICLO 3). Reemplaza a generate-church-icons.cjs
 * (que dibujaba la iglesia de Lucide y escribía public/icon.svg, hoy prohibido: ver test s3-web-assets).
 *
 * Uso (desde la raíz del repo):  node scripts/generate-brand-icons.cjs
 *  - Lee docs/referencias/identidad-visual/iconos/icono peregrinos.png SIN modificarlo (SHA-256 antes y después).
 *  - No deforma (fit: contain, proporción original), no recolorea y nunca amplía (el original mide 1254×1254).
 *  - Web/PWA: apps/web/src/app/icon.png (favicon), apple-icon.png y apps/web/public/icons/icon-{192,512,maskable-512}.png.
 *  - Android (preparación, como antes): resources/android/res/mipmap-*\/ic_launcher{,_round,_foreground}.png y el color
 *    de fondo del ícono adaptativo. NO toca android/: se copia con scripts/android-branding.ps1 cuando se autorice.
 *    La pantalla de inicio (splash) y el ícono de notificación (monocromo) no se derivan de este original: quedan igual.
 * BACKGROUND: fondo de las versiones opacas (Apple, maskable, Android). Blanco: el extremo inferior del pin es azul
 * oscuro y se confunde con el azul marino #0B3158. Es una decisión visual revisable: cambiar aquí y regenerar.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const SRC = path.join(root, "docs", "referencias", "identidad-visual", "iconos", "icono peregrinos.png");
const BACKGROUND = "#FFFFFF";
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

/** Arte centrado, escalado a `ratio` del lado, sobre fondo transparente o `bg` con forma (cuadrado redondeado/círculo). */
async function icon(file, n, { ratio, bg = null, shape = "square" }) {
  const side = Math.round(n * ratio);
  const art = await sharp(SRC).resize(side, side, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: true }).png().toBuffer();
  const base = bg
    ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">${shape === "circle" ? `<circle cx="${n / 2}" cy="${n / 2}" r="${n / 2}" fill="${bg}"/>` : shape === "rounded" ? `<rect width="${n}" height="${n}" rx="${n * 0.22}" fill="${bg}"/>` : `<rect width="${n}" height="${n}" fill="${bg}"/>`}</svg>`)
    : { create: { width: n, height: n, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const img = Buffer.isBuffer(base) ? sharp(base) : sharp(base);
  const info = await img.composite([{ input: art, gravity: "center" }]).png({ compressionLevel: 9 }).toFile(file);
  console.log(`${path.relative(root, file).padEnd(64)} ${info.width}×${info.height}`);
}

(async () => {
  if (!fs.existsSync(SRC)) throw new Error(`Falta el original: ${SRC}`);
  const before = sha(SRC);
  const meta = await sharp(SRC).metadata();
  console.log(`Original: ${meta.width}×${meta.height} ${meta.format} sha256=${before}`);
  const web = path.join(root, "apps", "web");
  await icon(path.join(web, "src/app/icon.png"), 512, { ratio: 1 });
  await icon(path.join(web, "src/app/apple-icon.png"), 180, { ratio: 0.8, bg: BACKGROUND });
  await icon(path.join(web, "public/icons/icon-192.png"), 192, { ratio: 1 });
  await icon(path.join(web, "public/icons/icon-512.png"), 512, { ratio: 1 });
  // Maskable: el sistema puede recortar hasta un círculo del 80 %: el arte queda dentro de la zona segura.
  await icon(path.join(web, "public/icons/icon-maskable-512.png"), 512, { ratio: 0.58, bg: BACKGROUND });

  const res = path.join(root, "resources", "android", "res");
  const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, n] of Object.entries(dens)) {
    await icon(path.join(res, `mipmap-${d}/ic_launcher.png`), n, { ratio: 0.8, bg: BACKGROUND, shape: "rounded" });
    await icon(path.join(res, `mipmap-${d}/ic_launcher_round.png`), n, { ratio: 0.66, bg: BACKGROUND, shape: "circle" });
    // Adaptativo: lienzo de 108 dp, zona segura = círculo de 66 dp → arte de ~46 dp (0,43), fondo transparente.
    await icon(path.join(res, `mipmap-${d}/ic_launcher_foreground.png`), Math.round((n * 108) / 48), { ratio: 0.43 });
  }
  fs.writeFileSync(path.join(res, "values/ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BACKGROUND}</color>\n</resources>\n`);
  if (sha(SRC) !== before) throw new Error("El original cambió durante la generación");
  console.log("Original intacto. Listo.");
})().catch((e) => { console.error(e); process.exit(1); });
