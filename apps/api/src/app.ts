import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { cfg } from "./config";
import { AppError } from "./lib/errors";
import { prisma } from "./lib/prisma";
import authPlugin from "./plugins/auth";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import userRoutes from "./routes/users";
import auditRoutes from "./routes/audit";
import participantRoutes from "./routes/participants";
import checkpointRoutes from "./routes/checkpoints";
import checkinRoutes from "./routes/checkins";
import invitationRoutes from "./routes/invitations";
import pilgrimRoutes from "./routes/pilgrim";
import accessRoutes from "./routes/access";
import contactRoutes from "./routes/contacts";
import sessionRoutes from "./routes/session";
import registrationRoutes from "./routes/registration";
import registrationAdminRoutes from "./routes/registrations";
import credentialRoutes from "./routes/credentials";
import streamRoutes from "./routes/stream";

export async function buildApp() {
  const app = Fastify({
    logger: { level: cfg.NODE_ENV === "production" ? "info" : "debug", redact: ["req.headers.cookie", "req.headers.authorization"] },
    trustProxy: true,
    bodyLimit: 1_000_000,
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: cfg.WEB_ORIGIN,
    credentials: true,
    allowedHeaders: ["Content-Type", "X-PG-Client"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 12 } });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
  await app.register(authPlugin);

  // Defensa CSRF: toda petición que modifica datos debe llevar un encabezado propio.
  // Un formulario o sitio externo no puede enviarlo sin pasar por el preflight de CORS.
  app.addHook("onRequest", async (req) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    if (req.headers["x-pg-client"] !== "web") {
      throw new AppError(403, "CSRF", "Petición no permitida.");
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: "VALIDATION",
        message: "Revisa los datos ingresados.",
        details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      });
    }
    if (err instanceof AppError) return reply.status(err.status).send({ error: err.code, message: err.message, ...(err.data ? { data: err.data } : {}) });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return reply.status(409).send({ error: "CONFLICT", message: "Ya existe un registro con esos datos." });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: "REQUEST_ERROR", message: (err as Error).message });
    req.log.error(err);
    return reply.status(500).send({ error: "INTERNAL", message: "Ocurrió un error inesperado. Intenta nuevamente." });
  });

  app.get("/api/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", time: new Date().toISOString() };
  });

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(eventRoutes, { prefix: "/api/events" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(auditRoutes, { prefix: "/api/audit-logs" });
  await app.register(participantRoutes, { prefix: "/api/events/:eventId/participants" });
  await app.register(checkpointRoutes, { prefix: "/api/events/:eventId/checkpoints" });
  await app.register(checkinRoutes, { prefix: "/api/events/:eventId/checkins" });
  await app.register(accessRoutes, { prefix: "/api/events/:eventId/access" });
  await app.register(contactRoutes, { prefix: "/api/events/:eventId/contacts" });
  await app.register(invitationRoutes, { prefix: "/api/invitations" });
  await app.register(pilgrimRoutes, { prefix: "/api/pilgrim" });
  await app.register(sessionRoutes, { prefix: "/api/session" });
  await app.register(registrationRoutes, { prefix: "/api/registration" });
  await app.register(registrationAdminRoutes, { prefix: "/api/events/:eventId/registrations" });
  await app.register(credentialRoutes, { prefix: "/api/events/:eventId/credentials" });
  await app.register(streamRoutes, { prefix: "/api/events/:eventId/stream" });

  return app;
}
