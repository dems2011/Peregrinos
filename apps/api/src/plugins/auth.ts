import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission, type Permission, type Role } from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { forbidden, unauthorized } from "../lib/errors";
import { sha256 } from "../lib/tokens";

export const ACCESS_COOKIE = "pg_at";
export const REFRESH_COOKIE = "pg_rt";
export const PILGRIM_COOKIE = "pg_pt";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
  extraPermissions: string[];
}
export interface PilgrimAuth {
  /** Presente cuando ya es participante oficial. */
  participantId?: string;
  /** Presente mientras su inscripción está en trámite. */
  registrationId?: string;
  eventId: string;
  sessionId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthUser;
    pilgrim: PilgrimAuth;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticatePilgrim: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (p: Permission) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app) => {
  await app.register(fjwt, {
    secret: cfg.JWT_SECRET,
    cookie: { cookieName: ACCESS_COOKIE, signed: false },
    sign: { expiresIn: `${cfg.ACCESS_TTL_MIN}m` },
  });

  app.decorateRequest("auth", undefined as unknown as AuthUser);
  app.decorateRequest("pilgrim", undefined as unknown as PilgrimAuth);

  /** Personal (administradores y operadores). Nunca acepta la cookie del peregrino. */
  app.decorate("authenticate", async (req: FastifyRequest) => {
    let sub: string;
    try {
      await req.jwtVerify({ onlyCookie: true });
      sub = (req.user as { sub: string }).sub;
    } catch {
      throw unauthorized();
    }
    // Se consulta la BD en cada petición: desactivar un usuario o cambiar su nivel surte efecto de inmediato.
    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user || !user.isActive) throw unauthorized();
    req.auth = {
      id: user.id, name: user.name, email: user.email, role: user.role,
      organizationId: user.organizationId, extraPermissions: user.extraPermissions,
    };
  });

  /** Peregrino: sesión opaca propia, cookie distinta y solo válida en /api/pilgrim. */
  app.decorate("authenticatePilgrim", async (req: FastifyRequest) => {
    const raw = req.cookies[PILGRIM_COOKIE];
    if (!raw) throw unauthorized("Abre tu enlace personal para entrar.");
    const s = await prisma.pilgrimSession.findUnique({ where: { tokenHash: sha256(raw) }, include: { participant: true, registration: true } });
    const subject = s?.participant ?? s?.registration ?? null;
    const blocked = (s?.participant && s.participant.status !== "ACTIVE") || (s?.registration && s.registration.status === "CANCELLED");
    if (!s || !subject || blocked || s.revokedAt || s.expiresAt < new Date()) {
      throw unauthorized("Tu acceso ya no es válido. Pide un enlace nuevo a la organización.");
    }
    req.pilgrim = { participantId: s.participantId ?? undefined, registrationId: s.registrationId ?? undefined, eventId: subject.eventId, sessionId: s.id };
  });

  app.decorate("requirePermission", (permission: Permission) => async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (!hasPermission(req.auth.role, req.auth.extraPermissions, permission)) throw forbidden();
  });
});
