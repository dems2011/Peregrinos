/**
 * Genera las variantes del fondo de Peregrinos a partir de la imagen original del cliente.
 *
 * Uso (desde la raíz del repo):  node scripts/generate-background.cjs
 *  - Lee assets/original/peregrinos.jpg (1664×2530, vertical) SIN modificarlo: verifica su SHA-256 antes y después.
 *  - Escribe apps/web/public/fondo/peregrinos-{ancho}.{avif,webp,jpg} en anchos 640, 960, 1280 y 1664 (el ancho original).
 *    Nunca se amplía: los anchos mayores que el original se descartan (withoutEnlargement).
 *  - Mismo encuadre que el original (sin recortes): el encuadre por pantalla lo hace el CSS (object-fit/object-position).
 * Requiere sharp (dependencia de Next, ya instalada).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const SRC = path.join(root, "assets", "original", "peregrinos.jpg");
const OUT = path.join(root, "apps", "web", "public", "fondo");
const WIDTHS = [640, 960, 1280, 1664];

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

(async () => {
  const before = sha(SRC);
  const meta = await sharp(SRC).metadata();
  console.log(`Original: ${meta.width}×${meta.height} ${meta.format} ${meta.space} sha256=${before}`);
  fs.mkdirSync(OUT, { recursive: true });
  for (const w of WIDTHS.filter((x) => x <= meta.width)) {
    // rotate() aplica la orientación EXIF; se quitan metadatos (EXIF/GPS) en las variantes públicas.
    const base = sharp(SRC).rotate().resize({ width: w, withoutEnlargement: true });
    const outputs = [
      [`peregrinos-${w}.avif`, base.clone().avif({ quality: 55, effort: 6 })],
      [`peregrinos-${w}.webp`, base.clone().webp({ quality: 78, effort: 6 })],
      [`peregrinos-${w}.jpg`, base.clone().jpeg({ quality: 80, mozjpeg: true, progressive: true })],
    ];
    for (const [name, pipeline] of outputs) {
      const info = await pipeline.toFile(path.join(OUT, name));
      console.log(`${name.padEnd(24)} ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
    }
  }
  const after = sha(SRC);
  if (after !== before) throw new Error("¡El original cambió!");
  console.log("Original intacto.");
})().catch((e) => { console.error(e); process.exit(1); });
