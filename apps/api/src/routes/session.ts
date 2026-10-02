import type { FastifyInstance } from "fastify";
import type { SessionResponse } from "@peregrinos/shared";
import { buildMe } from "../lib/session";

/**
 * Punto de entrada único de la app: dice quién está dentro (personal, peregrino o nadie)
 * para que el cliente abra la interfaz que corresponde. Nunca devuelve 401.
 */
export default async function sessionRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply): Promise<SessionResponse> => {
    reply.header("Cache-Control", "no-store");
    try {
      await app.authenticate(req, reply);
      return { kind: "staff", me: await buildMe(req.auth.id) };
    } catch { /* no es personal */ }
    try {
      await app.authenticatePilgrim(req, reply);
      return { kind: "pilgrim" };
    } catch { /* tampoco peregrino */ }
    return { kind: "none" };
  });
}
