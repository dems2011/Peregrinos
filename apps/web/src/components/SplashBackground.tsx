/**
 * Fase 6: fotografía de fondo de las pantallas de acceso (login, invitación). Imagen original del cliente en
 * assets/original/peregrinos.jpg; las variantes de public/fondo las genera scripts/generate-background.cjs (nunca amplía).
 *
 * El navegador elige formato (AVIF → WebP → JPEG) y ancho según `sizes`:
 *  - Pantalla horizontal (≥700 px: escritorio, tableta o celular girado): la foto ocupa la mitad izquierda (50vw de ancho, la altura se recorta un poco).
 *  - Vertical (celular, tableta): cabecera a todo el ancho (100vw) y 46 % del alto; la foto se recorta solo arriba y abajo.
 * Es decorativa: alt vacío y aria-hidden.
 */
const WIDTHS = [640, 960, 1280, 1664];
const SIZES = "(min-width: 700px) and (orientation: landscape) 50vw, 100vw";
const srcSet = (ext: string) => WIDTHS.map((w) => `/fondo/peregrinos-${w}.${ext} ${w}w`).join(", ");

export function SplashBackground() {
  return (
    <div className="splash-bg" aria-hidden="true">
      <picture>
        <source type="image/avif" srcSet={srcSet("avif")} sizes={SIZES} />
        <source type="image/webp" srcSet={srcSet("webp")} sizes={SIZES} />
        <img src="/fondo/peregrinos-960.jpg" srcSet={srcSet("jpg")} sizes={SIZES} alt="" width={1664} height={2530}
          decoding="async" fetchPriority="high" />
      </picture>
    </div>
  );
}
