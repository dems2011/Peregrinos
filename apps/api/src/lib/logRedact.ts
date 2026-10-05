import type { FastifyRequest } from "fastify";

/**
 * Los tokens opacos (seguimiento de solicitudes, invitaciones, inscripción) viajan en la query string.
 * Se ocultan en la URL antes de registrarla para que no queden en los logs.
 */
export function redactUrl(url: string): string {
  return url.replace(/([?&]token=)[^&#]*/gi, "$1[REDACTED]");
}

/** Igual al serializer `req` por defecto de Fastify, con la URL redactada. */
export function reqSerializer(req: FastifyRequest) {
  return {
    method: req.method,
    url: redactUrl(req.url),
    version: req.headers?.["accept-version"] as string | undefined,
    host: req.host,
    remoteAddress: req.ip,
    remotePort: req.socket?.remotePort,
  };
}
