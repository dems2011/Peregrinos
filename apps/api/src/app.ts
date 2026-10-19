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
import { redactUrl, reqSerializer } from "./lib/logRedact";
import { mailConfigured } from "./lib/mailer";
import { pushConfigured } from "./lib/push";
import authPlugin from "./plugins/auth";
import authRoutes from "./routes/auth";
import mfaRoutes from "./routes/mfa";
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
import organizationRequestRoutes from "./routes/organizationRequests";
import platformRoutes from "./routes/platform";
import organizationRoutes from "./routes/organization";
import personRoutes from "./routes/persons";
import pilgrimAccountRoutes from "./routes/pilgrimAccount";
import volunteerRoutes from "./routes/volunteers";
import geoRoutes from "./routes/geo";
import publicRoutes from "./routes/public";
import accountSocialRoutes from "./routes/accountSocial";
import chatRoutes from "./routes/chat";
import reportRoutes from "./routes/report";
import livestreamRoutes from "./routes/livestreams";
import trackingRoutes from "./routes/tracking";
import pilgrimTrackingRoutes from "./routes/pilgrimTracking";
import eventCoverRoutes from "./routes/eventCover";
import agendaRoutes from "./routes/agenda";
import donationRoutes from "./routes/donations";
import bulletinRoutes from "./routes/bulletins";
import sigypIntegrationRoutes from "./routes/sigypIntegration";
import organizationIntegrationRoutes from "./routes/organizationIntegrations";
import certificateRoutes, { certificatePublicRoutes } from "./routes/certificates";
import inventoryRoutes from "./routes/inventory";
import groupRoutes from "./routes/groups";
import { requiresCsrfHeader } from "./lib/csrf";
import { fastifyTrustProxy, trustProxyWarning } from "./lib/proxy";

export async function buildApp() {
  const app = Fastify({
    logger: { level: cfg.NODE_ENV === "production" ? "info" : "debug", redact: ["req.headers.cookie", "req.headers.authorization"], serializers: { req: reqSerializer } },
    trustProxy: fastifyTrustProxy(cfg.TRUST_PROXY),
    bodyLimit: 1_000_000,
  });
  const proxyWarning = trustProxyWarning(cfg.NODE_ENV, cfg.TRUST_PROXY);
  if (proxyWarning) app.log.warn(proxyWarning);

  await app.register(helmet);
  await app.register(cors, {
    origin: cfg.WEB_ORIGIN,
    credentials: true,
    // X-Request-Token: token privado de la solicitud de parroquia al subir su foto (nunca en la URL).
    allowedHeaders: ["Content-Type", "X-PG-Client", "X-Request-Token"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);
  // POST sin cuerpo con Content-Type JSON (logout, reenvíos): el parser por defecto responde 400. Se mantiene la
  // protección de Fastify contra __proto__/constructor y solo se acepta el cuerpo vacío.
  const defaultJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    const text = typeof body === "string" ? body : body.toString("utf8");
    if (text.trim() === "") return done(null, undefined);
    return defaultJson(req, text, done);
  });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 12 } });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
  await app.register(authPlugin);

  // Defensa CSRF: toda petición que modifica datos debe llevar un encabezado propio (lib/csrf.ts).
  // Un formulario o sitio externo no puede enviarlo sin pasar por el preflight de CORS. La integración servidor a
  // servidor con SIGyP (Bearer, sin cookies) queda exceptuada por su patrón de ruta registrado.
  app.addHook("onRequest", async (req) => {
    if (!requiresCsrfHeader(req.method, req.routeOptions?.url)) return;
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

  // Igual al 404 por defecto de Fastify, pero sin registrar ni devolver tokens de la query string.
  app.setNotFoundHandler((req, reply) => {
    const url = redactUrl(req.url);
    req.log.info(`Route ${req.method}:${url} not found`);
    return reply.status(404).send({ message: `Route ${req.method}:${url} not found`, error: "Not Found", statusCode: 404 });
  });

  app.get("/api/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    // Solo indica si hay SMTP y FCM (no expone la configuración): permite diagnosticar correos y push que no llegan.
    return { status: "ok", time: new Date().toISOString(), mail: mailConfigured() ? "smtp" : "disabled", push: pushConfigured() ? "fcm" : "disabled" };
  });

  await app.register(authRoutes, { prefix: "/api/auth" });
  // A6: MFA del personal (login en dos pasos, enrolamiento, step-up, códigos de recuperación).
  await app.register(mfaRoutes, { prefix: "/api/auth/mfa" });
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
  // A3: ciclo de vida de organizaciones.
  await app.register(organizationRequestRoutes, { prefix: "/api/organization-requests" });
  await app.register(platformRoutes, { prefix: "/api/platform" });
  await app.register(organizationRoutes, { prefix: "/api/organization" });
  // A4a: identidad humana (Person), separada de la cuenta y de la participación.
  await app.register(personRoutes, { prefix: "/api/persons" });
  // A5.0: área de cuenta del peregrino (login, verificación, recuperación, historial).
  await app.register(pilgrimAccountRoutes, { prefix: "/api/auth/account" });
  // A5.1: voluntariado del evento (voluntarios, equipos, zonas, funciones, turnos, asignaciones).
  await app.register(volunteerRoutes, { prefix: "/api/events/:eventId/volunteering" });
  // G1: catálogo geográfico de solo lectura (países, niveles, áreas) para el selector encadenado.
  await app.register(geoRoutes, { prefix: "/api/geo" });
  // B1: perfil público de parroquias (sin sesión), chat por evento e informe del evento.
  await app.register(publicRoutes, { prefix: "/api/public" });
  await app.register(accountSocialRoutes, { prefix: "/api/auth/account" });
  await app.register(chatRoutes, { prefix: "/api/events/:eventId/chat" });
  await app.register(reportRoutes, { prefix: "/api/events/:eventId/report" });
  // B5: herramientas parroquiales (cada una con su permiso; todo acotado a la organización de la sesión).
  await app.register(livestreamRoutes, { prefix: "/api/organization/livestreams" });
  await app.register(trackingRoutes, { prefix: "/api/events/:eventId/tracking" });
  await app.register(pilgrimTrackingRoutes, { prefix: "/api/pilgrim/tracking" });
  await app.register(eventCoverRoutes, { prefix: "/api/events/:eventId/cover" });
  await app.register(agendaRoutes, { prefix: "/api/organization/agenda" });
  await app.register(donationRoutes, { prefix: "/api/organization/donations" });
  await app.register(bulletinRoutes, { prefix: "/api/organization/bulletins" });
  // SIGyP (Gestión Parroquial): entrada autenticada por credencial de organización y su administración.
  await app.register(sigypIntegrationRoutes, { prefix: "/api/integrations/sigyp/v1" });
  await app.register(organizationIntegrationRoutes, { prefix: "/api/organization/integrations/sigyp" });
  await app.register(certificateRoutes, { prefix: "/api/organization/certificates" });
  await app.register(certificatePublicRoutes, { prefix: "/api/public" });
  await app.register(inventoryRoutes, { prefix: "/api/organization/inventory" });
  await app.register(groupRoutes, { prefix: "/api/organization/groups" });

  return app;
}
