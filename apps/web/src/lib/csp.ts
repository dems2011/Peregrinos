/**
 * Content Security Policy de la web de Peregrinos (la aplica src/middleware.ts con un nonce nuevo por petición).
 *
 * Origen único para la web, sus recursos y la API (/api → API por reescritura). Excepciones, con su causa:
 * - script-src: 'nonce-…' + 'strict-dynamic'. Next (App Router) inyecta scripts en línea y carga sus fragmentos desde
 *   ellos; el nonce los autoriza solo a ellos. La app Android (Capacitor) inyecta su puente desde el código nativo,
 *   que la CSP no restringe.
 * - style-src-attr 'unsafe-inline': las pantallas usan ~310 atributos `style`. Solo atributos (no <style> ni scripts).
 *   Retirarla exige pasarlos a clases, como se hizo en SIGyP (pendiente).
 * - img-src https://tile.openstreetmap.org (mapas de Leaflet), data: (íconos de Leaflet) y blob: (vista previa del
 *   recorte de foto).
 * - connect-src blob:: la app Android lee los PDF generados en la página con fetch(blob:) (MainActivity).
 * - worker-src blob:: el lector de QR (qr-scanner) crea su worker desde un blob.
 * - frame-src: reproductor y chat de YouTube de las transmisiones (ParishProfileView).
 * - Solo en desarrollo (`next dev`): 'unsafe-eval' y estilos en línea. Nunca en producción.
 */
export interface CspOptions { nonce: string; dev: boolean }

export function buildCsp({ nonce, dev }: CspOptions): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("Nonce de CSP inválido.");
  const d: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", ...(dev ? ["'unsafe-inline'"] : [])],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://tile.openstreetmap.org"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", "blob:"],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["https://www.youtube-nocookie.com", "https://www.youtube.com"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(d).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}

/** Nonce aleatorio de 128 bits en base64 (Web Crypto: funciona en el entorno del middleware). */
export function newNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
}

/**
 * Despliegue progresivo: por defecto la política solo se INFORMA (Report-Only: el navegador registra en la consola lo
 * que habría bloqueado, sin bloquear). CSP_MODE=enforce la aplica; CSP_MODE=off la desactiva. Pasar a «enforce» en
 * producción solo después de observar la consola sin violaciones en web y en la app Android.
 */
export type CspMode = "enforce" | "report-only" | "off";
export const cspMode = (v: string | undefined): CspMode => (v === "enforce" || v === "off" ? v : "report-only");
export const cspHeaderName = (mode: Exclude<CspMode, "off">) => (mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only");
