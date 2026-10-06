/**
 * Marca de Peregrinos (el mismo pin del icono, la PWA, el favicon y Android): pin blanco con el punto azul.
 * Pensada para fondos azules; decorativa (el nombre va como texto al lado).
 */
export function BrandMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <path d="M256 40c-86 0-148 66-148 146 0 104 148 286 148 286s148-182 148-286c0-80-62-146-148-146z" fill="#fff" />
      <circle cx="256" cy="186" r="62" fill="#1677FF" />
    </svg>
  );
}
