/**
 * Defensa CSRF (app.ts): toda petición que modifica datos debe llevar `X-PG-Client: web`, un encabezado que un
 * formulario o sitio externo no puede enviar sin pasar por el preflight de CORS. Protege las credenciales que el
 * navegador adjunta solo (cookies de sesión).
 *
 * Excepción: la integración servidor a servidor con SIGyP (`/api/integrations/sigyp/v1/*`). Esas rutas no usan cookies
 * ni sesión: se autentican con la credencial `Bearer pgsig_…` o con un código de un solo uso en el cuerpo, que un
 * sitio ajeno no puede adjuntar por el usuario; un encabezado «web» no les aportaría nada. Se decide por el PATRÓN de
 * ruta registrado (no por la URL cruda): una URL manipulada no hereda la excepción y una ruta inexistente sigue
 * exigiendo el encabezado.
 */
export const CSRF_EXEMPT_ROUTE_PREFIX = "/api/integrations/sigyp/v1/";

export function requiresCsrfHeader(method: string, routePattern: string | undefined): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  return !(routePattern ?? "").startsWith(CSRF_EXEMPT_ROUTE_PREFIX);
}
