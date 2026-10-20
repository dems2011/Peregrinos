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

## Originales recibidos e integración (CICLO 3, 2026-10-19)

| Original (en `docs/referencias/identidad-visual/`) | Formato | Estado |
|---|---|---|
| `iconos/icono peregrinos.png` | PNG 1254×1254, transparente (alfa ≈ 99 % en la forma), sin SVG | **Integrado**: `scripts/generate-brand-icons.cjs` genera favicon (`src/app/icon.png`), `apple-icon.png`, PWA 192/512/maskable y `resources/android/res` (ícono clásico, redondo y adaptativo). El `icon.svg` de Lucide se retiró |
| `logos/Logotipo Peregrinos.png` | PNG 1774×887, transparente, sin SVG | Sin integrar: la interfaz no tiene hoy un lugar para el logo horizontal (pantallas de acceso usan la foto). Pendiente de decidir dónde mostrarlo (p. ej. portal o acceso) |
| `fondos/fondo para web.png` | PNG 1983×793 (panorámica 2,5:1), sin transparencia | Sin integrar: el fondo actual de acceso es vertical (1664×2530) y ocupa media pantalla o una cabecera; la panorámica se recortaría mucho. Apta para una cabecera horizontal (portal). Decisión de diseño pendiente; `scripts/generate-background.cjs` sirve de modelo |

Decisiones tomadas y revisables: fondo **blanco** en las versiones opacas (Apple, maskable, Android) porque el extremo
inferior del pin es azul oscuro y se pierde sobre el azul marino `#0B3158` (constante `BACKGROUND` del generador). El
color de tema del manifiesto y del sistema sigue siendo `#0B3158`. **Android real sin cambiar**: `android/` conserva los
íconos anteriores hasta que el propietario ejecute `scripts/android-branding.ps1` (con copia previa). La pantalla de
inicio (splash) y el ícono de notificación (silueta monocroma) no se derivan de este original.

Para mejorar la nitidez en tamaños chicos y en el ícono de notificación conviene tener el **vector original (SVG)** del
ícono y una **silueta monocroma**; si existen, colocarlos en `iconos/`.
