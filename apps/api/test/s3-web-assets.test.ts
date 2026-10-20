/**
 * Recursos gráficos de la web: un archivo en `public/` con el mismo nombre que un archivo de metadatos de `src/app`
 * (icon.svg, apple-icon.png, favicon.ico…) hace que Next responda 500 en desarrollo («conflicting public file and page
 * file»). También comprueba que los íconos del manifiesto existen y miden lo que declaran. Sin base de datos.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WEB = path.join(__dirname, "..", "..", "web");
const PUBLIC = path.join(WEB, "public");
const APP = path.join(WEB, "src", "app");

async function corner(file: string) {
  const b = fs.readFileSync(file);
  // Canal alfa del primer píxel: los PNG de este proyecto se escriben con sharp sin entrelazado; basta con sharp.
  const sharp = (await import("sharp")).default;
  const { data } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[3];
}

function pngSize(file: string) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(1, 4).toString("latin1"), "PNG", `${file} no es PNG`);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

describe("S3: recursos gráficos de la web", () => {
  it("ningún archivo de metadatos de src/app se repite en public/", () => {
    const metadata = fs.readdirSync(APP, { withFileTypes: true })
      .filter((e) => e.isFile() && !/\.(tsx?|css)$/.test(e.name))
      .map((e) => e.name);
    assert.ok(metadata.includes("icon.png"), "se esperaba src/app/icon.png (ícono oficial)");
    const dup = metadata.filter((n) => fs.existsSync(path.join(PUBLIC, n)));
    assert.deepEqual(dup, [], `duplicados en public/ y src/app/: ${dup.join(", ")}`);
  });

  it("los íconos del manifiesto existen y tienen el tamaño declarado", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, "manifest.webmanifest"), "utf8")) as {
      icons: { src: string; sizes: string; type: string }[];
    };
    assert.ok(manifest.icons.length > 0);
    for (const icon of manifest.icons) {
      const rel = icon.src.replace(/^\//, "");
      const file = [path.join(PUBLIC, rel), path.join(APP, rel)].find((f) => fs.existsSync(f));
      assert.ok(file, `no existe ${icon.src} ni en public/ ni en src/app/`);
      if (icon.type === "image/png") assert.equal(pngSize(file), icon.sizes, icon.src);
    }
  });

  it("las versiones que el sistema no recorta con transparencia son opacas (Apple, maskable)", async () => {
    for (const f of [path.join(APP, "apple-icon.png"), path.join(PUBLIC, "icons", "icon-maskable-512.png")]) assert.equal(await corner(f), 255, f);
  });

  it("Android (resources/android/res): ícono por densidad con su tamaño y color de fondo del adaptativo", () => {
    const res = path.join(__dirname, "..", "..", "..", "resources", "android", "res");
    for (const [d, n] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
      const dir = path.join(res, `mipmap-${d}`);
      assert.equal(pngSize(path.join(dir, "ic_launcher.png")), `${n}x${n}`);
      assert.equal(pngSize(path.join(dir, "ic_launcher_round.png")), `${n}x${n}`);
      const f = Math.round((n * 108) / 48);
      assert.equal(pngSize(path.join(dir, "ic_launcher_foreground.png")), `${f}x${f}`);
    }
    assert.match(fs.readFileSync(path.join(res, "values", "ic_launcher_background.xml"), "utf8"), /<color name="ic_launcher_background">#[0-9A-F]{6}<\/color>/);
  });
});
