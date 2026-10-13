# Fondo fotográfico (Fase 6)

## Original
- `assets/original/peregrinos.jpg` — imagen del cliente. **No se modifica**: JPEG 1664×2530 (vertical, 2:3,04),
  sRGB, 300 ppp, 2,4 MB. SHA-256 `5be70cc785c65e84ed85d9ef679b506cded85befdc6011aee8d56ffda4c60a35`.
- Composición: peregrino de espaldas a la izquierda (≈10–35 % del ancho, 30–60 % del alto) y la cruz con el sol a la
  derecha (≈70 % del ancho, 34–40 % del alto). Cielo oscuro arriba y pasto oscuro abajo.

## Variantes
`node scripts/generate-background.cjs` → `apps/web/public/fondo/peregrinos-{640,960,1280,1664}.{avif,webp,jpg}`.
Mismo encuadre que el original (el recorte por pantalla lo hace el CSS), nunca más anchas que el original, sin
metadatos. El script comprueba que el SHA-256 del original no cambia.

| Ancho | AVIF | WebP | JPEG |
|---|---|---|---|
| 640 | 30 KB | 34 KB | 52 KB |
| 960 | 54 KB | 60 KB | 100 KB |
| 1280 | 78 KB | 91 KB | 158 KB |
| 1664 | 109 KB | 134 KB | 235 KB |

El navegador elige formato (AVIF → WebP → JPEG) y ancho con `<picture>`/`srcset`/`sizes` (`components/SplashBackground.tsx`).

## Dónde se usa y cómo se adapta
Pantallas de acceso: `/login` e `/invitacion` (clase `splash photo`). El resto de la app mantiene fondos lisos para
no restar legibilidad a listas y formularios.

- **Vertical (celular, tableta):** cabecera fotográfica a todo el ancho y 46 % del alto; se ven el peregrino y la cruz;
  la marca va sobre el pasto oscurecido y el formulario debajo, sobre el azul de la marca (contraste igual al anterior).
- **Horizontal desde 700 px (escritorio, tableta o celular girados):** la foto ocupa la mitad izquierda (máximo
  1664 px de ancho) y el formulario la derecha.
- `object-fit: cover` (sin deformar). Mientras carga se ve el azul de la marca.

## Verificación (2026-10-12, Chrome headless)
Escala real (píxeles del dispositivo / píxeles del original) — nunca mayor que 1, es decir, nunca se amplía:

| Pantalla | Archivo elegido | Escala |
|---|---|---|
| Celular 360×780 @3x | 1280 AVIF | 0,65 |
| Celular 412×915 @2,6x | 1280 AVIF | 0,65 |
| Celular girado 915×412 @2,6x | 1280 AVIF | 0,72 |
| Tableta 768×1024 @2x | 1664 AVIF | 0,92 |
| Tableta girada 1024×768 @2x | 1280 AVIF | 0,62 |
| Portátil 1366×768 | 960 AVIF | 0,41 |
| Escritorio 1920×1080 | 960 AVIF | 0,58 |
| Ultra ancho 2560×1080 | 1280 AVIF | 0,77 |

Sin desplazamiento horizontal en ninguna. Límite conocido: monitores muy grandes con escalado alto (p. ej. 4K al 150 %)
o celulares girados de menos de 700 px de ancho a 3x pueden mostrar la foto algo por encima de su resolución
original; no hay más resolución disponible que la del archivo entregado.
