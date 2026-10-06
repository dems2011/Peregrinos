/**
 * Normalización determinista de nombres para búsqueda y detección de duplicados.
 * No modifica el nombre original: devuelve una clave de comparación.
 *
 *  1. NFKD: descompone diacríticos y unifica compatibilidades (ligaduras, anchos, superíndices).
 *  2. Elimina marcas combinantes (diacríticos): "Córdoba" → "Cordoba".
 *  3. Unifica equivalentes: apóstrofos y comillas tipográficas, guiones y rayas.
 *  4. Minúsculas sin depender de la configuración regional del sistema.
 *  5. Colapsa cualquier espacio Unicode (incluido el no separable) y recorta.
 */
const APOSTROPHES = /[‘’‚‛′`´ʼ]/g; // ‘ ’ ‚ ‛ ′ ` ´ ʼ → '
const QUOTES = /[“”„‟″«»]/g;             // “ ” „ ‟ ″ « » → "
const DASHES = /[‐-―−﹘﹣－]/g;                   // ‐ ‑ ‒ – — ― − → -
const SPACES = /[\s   -   　]+/g;

export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(APOSTROPHES, "'")
    .replace(QUOTES, '"')
    .replace(DASHES, "-")
    .toLowerCase()
    .replace(SPACES, " ")
    .trim();
}
