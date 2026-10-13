import { ApiError } from "./api";

/** Mensaje para mostrar: los errores de validación por campo o el mensaje de la API; si no, el texto de respaldo. */
export const errMsg = (e: unknown, fallback = "No se pudo completar la acción.") =>
  e instanceof ApiError ? e.details?.map((d) => d.message).join(". ") || e.message : fallback;
