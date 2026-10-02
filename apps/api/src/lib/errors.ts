export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public data?: Record<string, unknown>) {
    super(message);
  }
}
export const unauthorized = (msg = "Sesión no válida. Inicia sesión nuevamente.") => new AppError(401, "UNAUTHORIZED", msg);
export const forbidden = (msg = "No tienes permiso para realizar esta acción.") => new AppError(403, "FORBIDDEN", msg);
export const notFound = (msg = "No se encontró el recurso.") => new AppError(404, "NOT_FOUND", msg);
export const conflict = (msg: string) => new AppError(409, "CONFLICT", msg);
