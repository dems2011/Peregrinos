/**
 * Marca de Peregrinos: la iglesia (Lucide Church) blanca con la puerta azul, la misma del favicon, la PWA y Android
 * (scripts/generate-church-icons.cjs). Pensada para fondos azules; decorativa (el nombre va como texto al lado).
 * MapPin queda reservado para ubicaciones (parroquias, puntos de control, mapas).
 */
export function BrandMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14,22 v-4 a2,2 0 0,0 -4,0 v4 z" fill="#1677FF" />
      <path d="M10,9 h4" />
      <path d="M12,7 v5" />
      <path d="M18,22 V5.618 a1,1 0 0,0 -0.553,-0.894 l-4.553,-2.277 a2,2 0 0,0 -1.788,0 L6.553,4.724 A1,1 0 0,0 6,5.618 V22" />
      <path d="M18,7 l3.447,1.724 a1,1 0 0,1 0.553,0.894 V20 a2,2 0 0,1 -2,2 H4 a2,2 0 0,1 -2,-2 V9.618 a1,1 0 0,1 0.553,-0.894 L6,7" />
    </svg>
  );
}
