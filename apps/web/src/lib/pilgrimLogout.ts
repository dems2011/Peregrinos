import { ApiError, post } from "./api";

/**
 * Cierra en el servidor las dos sesiones de peregrino de este navegador (cuenta pg_pa y evento /p pg_pt) en una sola
 * petición. Devuelve true solo si el servidor lo confirmó. Las cookies son HttpOnly: el navegador no puede borrarlas
 * por su cuenta, así que sin respuesta del servidor no hay cierre que confirmar.
 * Compatibilidad: si la API todavía no tiene /pilgrim/logout-browser (404), se usan los dos cierres anteriores EN
 * ORDEN: primero el del evento (revoca en la base y recién entonces borra su cookie) y, solo si se confirmó, el de la
 * cuenta. Así una falla nunca deja una sesión de evento vigente sin la cookie que permite revocarla, y reintentar
 * siempre puede completar el cierre. Éxito solo si los dos se confirmaron.
 */
export async function closeBrowserSessions(): Promise<boolean> {
  try {
    await post("/pilgrim/logout-browser");
    return true;
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) return false;
  }
  try {
    await post("/pilgrim/logout");
    await post("/auth/account/logout");
    return true;
  } catch {
    return false;
  }
}
