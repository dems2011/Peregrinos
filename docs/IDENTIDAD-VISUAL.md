# Identidad visual de Peregrinos — dónde van los originales y dónde los usa la app

**Originales del propietario:** `docs/referencias/identidad-visual/` con las subcarpetas `logos/`, `iconos/`,
`favicons/`, `capturas/`, `fondos/` y `referencias/` (fuera de Git, como el resto de `docs/referencias/`). Ninguna
aplicación lee esa carpeta: los recursos de producción se derivan de ahí sin deformar ni recolorear el diseño. La marca
no se cambia sin aprobación.

| Subcarpeta | Qué colocar | Formato |
|---|---|---|
| `logos/` | Logo y variantes (horizontal, símbolo, fondo claro/oscuro, monocromo) | SVG original + PNG transparente ≥ 1024 px; archivo fuente si existe |
| `iconos/` | Ícono cuadrado de la app | SVG + PNG 1024×1024 transparente; **y** el primer plano solo (para el ícono adaptable de Android, con margen de seguridad: el símbolo dentro del 66 % central) + color de fondo en HEX |
| `favicons/` | Favicon específico, si existe | SVG, PNG 32/48, `.ico` |
| `capturas/` | Cómo debe verse | PNG/JPG |
| `fondos/` | Fotografías de fondo | JPG/PNG ≥ 1920 px de ancho, con constancia de derechos |
| `referencias/` | Manual, paletas, tipografías | PDF/MD/imagen |

## Rutas de producción (inventario 2026-10-19)

| Uso | Ruta | Medidas actuales |
|---|---|---|
| Favicon (Next, archivo de metadatos) | `apps/web/src/app/icon.svg` | vector |
| Ícono de Apple | `apps/web/src/app/apple-icon.png` | 180×180 |
| PWA (manifiesto) | `apps/web/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | 192, 512, 512 (maskable) |
| Manifiesto | `apps/web/public/manifest.webmanifest` | fondo y tema `#0B3158` |
| Fondo de inicio | `apps/web/public/fondo/peregrinos-{640,960,1280,1664}.{avif,webp,jpg}` | 4 anchos × 3 formatos |
| Android, ícono heredado y redondo | `android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher{,_round}.png` | 48, 72, 96, 144, 192 |
| Android, ícono adaptable | `mipmap-anydpi-v26/ic_launcher.xml` → `ic_launcher_foreground.png` + color `ic_launcher_background` | primer plano por densidad |
| Android, pantalla de inicio | `drawable*/splash.png` (y copia de referencia en `resources/android/res/`) | por densidad y orientación |

Reglas: no poner un archivo en `public/` con el mismo nombre que uno de `src/app/` (`icon.svg`, `apple-icon.png`…):
Next responde 500 en desarrollo; lo comprueba la prueba `apps/api/test/s3-web-assets.test.ts`. La carpeta `android/` no
está en Git: cualquier cambio de íconos nativos se hace con copia previa y se regenera con las herramientas de Capacitor
a partir del ícono de 1024 px, nunca editando a mano cada densidad.
