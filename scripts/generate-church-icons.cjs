/**
 * Genera la identidad de Peregrinos (iglesia) para Web/PWA y Android a partir del icono Church de Lucide
 * (lucide-react 0.460, rejilla de 24 unidades): iglesia blanca con la puerta azul sobre el azul marino de la marca.
 *
 * Uso (desde la raíz del repo):  node scripts/generate-church-icons.cjs
 *  - Web/PWA: apps/web/src/app/icon.svg (favicon), apps/web/src/app/apple-icon.png, apps/web/public/icon.svg,
 *    apps/web/public/icons/icon-192.png, icon-512.png e icon-maskable-512.png.
 *  - Android (preparación): resources/android/res → iconos, splash e icono de notificación. Se copian al proyecto
 *    android/ con scripts/android-church-push.ps1.
 * Mismas dimensiones que los archivos que reemplaza. Requiere sharp (dependencia de Next, ya instalada).
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const NAVY = "#0B3158";
const BLUE = "#1677FF";
const WHITE = "#FFFFFF";

/** Trazos de Lucide Church con separadores explícitos (también los usa el vector de Android). */
const CHURCH = [
  "M10,9 h4",
  "M12,7 v5",
  "M18,22 V5.618 a1,1 0 0,0 -0.553,-0.894 l-4.553,-2.277 a2,2 0 0,0 -1.788,0 L6.553,4.724 A1,1 0 0,0 6,5.618 V22",
  "M18,7 l3.447,1.724 a1,1 0 0,1 0.553,0.894 V20 a2,2 0 0,1 -2,2 H4 a2,2 0 0,1 -2,-2 V9.618 a1,1 0 0,1 0.553,-0.894 L6,7",
];
/** Puerta (cerrada para rellenarla de azul). */
const DOOR = "M14,22 v-4 a2,2 0 0,0 -4,0 v4 z";

/** Iglesia centrada en (cx, cy) con lado `size` (px). */
function church(cx, cy, size, { stroke = WHITE, door = BLUE, width = 2 } = {}) {
  const s = size / 24;
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${s})" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">`
    + (door ? `<path d="${DOOR}" fill="${door}" stroke="${stroke}"/>` : `<path d="${DOOR}"/>`)
    + CHURCH.map((d) => `<path d="${d}"/>`).join("")
    + "</g>";
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** Icono cuadrado: fondo (cuadrado, redondeado o círculo) + iglesia que ocupa `ratio` del lado. */
function iconSvg(n, { shape = "square", ratio = 0.56, background = NAVY } = {}) {
  const bg = !background ? ""
    : shape === "circle" ? `<circle cx="${n / 2}" cy="${n / 2}" r="${n / 2}" fill="${background}"/>`
    : shape === "rounded" ? `<rect width="${n}" height="${n}" rx="${n * 0.1875}" fill="${background}"/>`
    : `<rect width="${n}" height="${n}" fill="${background}"/>`;
  // El dibujo de Lucide ocupa de 2 a 22 en ambos ejes: ya está centrado en su rejilla de 24.
  return svg(n, n, bg + church(n / 2, n / 2, n * ratio));
}

/** Splash: iglesia, "Peregrinos" y el lema, centrados (mismo diseño que el splash anterior). */
function splashSvg(w, h) {
  const u = Math.min(w, h);
  const g = u * 0.22, title = u * 0.094, tag = u * 0.042;
  const block = g + u * 0.05 + title + u * 0.035 + tag;
  const top = h / 2 - block / 2;
  const titleY = top + g + u * 0.05 + title * 0.8;
  const tagY = titleY + u * 0.035 + tag * 1.05;
  return svg(w, h,
    `<rect width="${w}" height="${h}" fill="${NAVY}"/>` + church(w / 2, top + g / 2, g)
    + `<text x="${w / 2}" y="${titleY}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="${title}" fill="${WHITE}">Peregrinos</text>`
    + `<text x="${w / 2}" y="${tagY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${tag}" fill="#D6E4F5">La Iglesia más cerca de ti</text>`);
}

/** Icono de notificación de Android (barra de estado): vector blanco sobre transparente, sin relleno. */
function notificationVector() {
  const p = (d) => `    <path android:pathData="${d}" android:strokeColor="#FFFFFFFF" android:strokeWidth="2" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Icono de las notificaciones push (Lucide Church). Generado por scripts/generate-church-icons.cjs. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
${[DOOR.replace(" z", ""), ...CHURCH].map(p).join("\n")}
</vector>
`;
}

async function png(file, svgText, w, h) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svgText)).resize(w, h).png({ compressionLevel: 9 }).toFile(file);
  console.log(`  ${path.relative(root, file)} (${w}x${h})`);
}
function text(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`  ${path.relative(root, file)}`);
}

(async () => {
  const web = path.join(root, "apps/web");
  console.log("Web/PWA:");
  const appSvg = iconSvg(512, { shape: "rounded", ratio: 0.58 });
  text(path.join(web, "src/app/icon.svg"), appSvg + "\n");
  text(path.join(web, "public/icon.svg"), appSvg + "\n");
  await png(path.join(web, "src/app/apple-icon.png"), iconSvg(180, { ratio: 0.58 }), 180, 180);
  await png(path.join(web, "public/icons/icon-192.png"), iconSvg(192, { shape: "rounded", ratio: 0.58 }), 192, 192);
  await png(path.join(web, "public/icons/icon-512.png"), iconSvg(512, { shape: "rounded", ratio: 0.58 }), 512, 512);
  // Maskable: el sistema recorta hasta un círculo del 80 %: la iglesia queda dentro de la zona segura.
  await png(path.join(web, "public/icons/icon-maskable-512.png"), iconSvg(512, { ratio: 0.46 }), 512, 512);

  const res = path.join(root, "resources/android/res");
  console.log("Android (resources/android/res):");
  const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, n] of Object.entries(dens)) {
    await png(path.join(res, `mipmap-${d}/ic_launcher.png`), iconSvg(n, { shape: "rounded", ratio: 0.6 }), n, n);
    await png(path.join(res, `mipmap-${d}/ic_launcher_round.png`), iconSvg(n, { shape: "circle", ratio: 0.56 }), n, n);
    // Adaptativo: lienzo de 108 dp; la zona segura es un círculo de 66 dp → iglesia de ~44 dp, fondo transparente.
    const f = Math.round((n * 108) / 48);
    await png(path.join(res, `mipmap-${d}/ic_launcher_foreground.png`), iconSvg(f, { ratio: 0.41, background: null }), f, f);
  }
  const splashes = {
    "drawable/splash.png": [480, 320],
    "drawable-land-mdpi/splash.png": [480, 320], "drawable-land-hdpi/splash.png": [800, 480],
    "drawable-land-xhdpi/splash.png": [1280, 720], "drawable-land-xxhdpi/splash.png": [1600, 960],
    "drawable-land-xxxhdpi/splash.png": [1920, 1280],
    "drawable-port-mdpi/splash.png": [320, 480], "drawable-port-hdpi/splash.png": [480, 800],
    "drawable-port-xhdpi/splash.png": [720, 1280], "drawable-port-xxhdpi/splash.png": [960, 1600],
    "drawable-port-xxxhdpi/splash.png": [1280, 1920],
  };
  for (const [f, [w, h]] of Object.entries(splashes)) await png(path.join(res, f), splashSvg(w, h), w, h);
  text(path.join(res, "drawable/ic_stat_peregrinos.xml"), notificationVector());
  console.log("Listo.");
})().catch((e) => { console.error(e); process.exit(1); });
