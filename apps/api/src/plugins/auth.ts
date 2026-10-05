import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  hasPermission,
  type AccountType,
  type OrganizationStatus,
  type Permission,
  type Role,
} from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { forbidden, unauthorized } from "../lib/errors";
import { sha256 } from "../lib/tokens";
import { assertOrgCan } from "../lib/orgLifecycle";

export const ACCESS_COOKIE = "pg_at";
export const REFRESH_COOKIE = "pg_rt";
export const PILGRIM_COOKIE = "pg_pt";
export const PILGRIM_ACCOUNT_COOKIE = "pg_pa";
/** A3: sesión del operador de plataforma (PLATFORM_ADMIN). Independiente de la del personal. */
export const PLATFORM_COOKIE = "pg_pl";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  accountType: AccountType;
  organizationId: string;
  /** A3: estado del ciclo de vida de la organización, leído de la BD en cada petición. */
  organizationStatus: OrganizationStatus;
  extraPermissions: string[];
}

/** A3: operador de plataforma autenticado. */
export interface PlatformAuth {
  id: string;
  name: string;
  email: string;
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
    pilgrimAccount: { id: string };
    platform: PlatformAuth;
  }

  interface FastifyInstance {
    authenticate: (
      req: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;

    authenticatePilgrim: (
      req: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;

    authenticatePilgrimAccount: (
      req: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;

    requirePermission: (
      p: Permission
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

    authenticatePlatform: (
      req: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

export default fp(async (app) => {
  await app.register(fjwt, {
    secret: cfg.JWT_SECRET,
    cookie: {
      cookieName: ACCESS_COOKIE,
      signed: false,
    },
    sign: {
      expiresIn: `${cfg.ACCESS_TTL_MIN}m`,
    },
  });

  app.decorateRequest(
    "auth",
    undefined as unknown as AuthUser
  );

  app.decorateRequest(
    "pilgrim",
    undefined as unknown as PilgrimAuth
  );

  app.decorateRequest(
    "pilgrimAccount",
    undefined as unknown as { id: string }
  );

  app.decorateRequest(
    "platform",
    undefined as unknown as PlatformAuth
  );

  /** Personal: administradores y operadores. */
  app.decorate(
    "authenticate",
    async (req: FastifyRequest) => {
      let sub: string;

      try {
        await req.jwtVerify({ onlyCookie: true });
        sub = (req.user as { sub: string }).sub;
      } catch {
        throw unauthorized();
      }

      const user = await prisma.user.findUnique({
        where: { id: sub },
        include: { organization: { select: { status: true } } },
      });

      // A2: solo el personal tiene organización y rol (la BD lo impone con CHECK).
      if (
        !user ||
        !user.isActive ||
        user.accountType !== "STAFF" ||
        !user.organizationId ||
        !user.role ||
        !user.organization
      ) {
        throw unauthorized();
      }

      req.auth = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountType: user.accountType,
        organizationId: user.organizationId,
        organizationStatus: user.organization.status,
        extraPermissions: user.extraPermissions,
      };
    }
  );

  /** Peregrino: sesión por enlace personal. */
  app.decorate(
    "authenticatePilgrim",
    async (req: FastifyRequest) => {
      const raw = req.cookies[PILGRIM_COOKIE];

      if (!raw) {
        throw unauthorized(
          "Abre tu enlace personal para entrar."
        );
      }

      const s = await prisma.pilgrimSession.findUnique({
        where: {
          tokenHash: sha256(raw),
        },
        include: {
          participant: true,
          registration: true,
        },
      });

      const subject =
        s?.participant ?? s?.registration ?? null;

      const blocked =
        (s?.participant &&
          s.participant.status !== "ACTIVE") ||
        (s?.registration &&
          s.registration.status === "CANCELLED");

      if (
        !s ||
        !subject ||
        blocked ||
        s.revokedAt ||
        s.expiresAt < new Date()
      ) {
        throw unauthorized(
          "Tu acceso ya no es válido. Pide un enlace nuevo a la organización."
        );
      }

      req.pilgrim = {
        participantId: s.participantId ?? undefined,
        registrationId: s.registrationId ?? undefined,
        eventId: subject.eventId,
        sessionId: s.id,
      };
    }
  );

  /** Cuenta personal del peregrino. */
  app.decorate(
    "authenticatePilgrimAccount",
    async (req: FastifyRequest) => {
      let sub: string;

      try {
        const token =
          req.cookies[PILGRIM_ACCOUNT_COOKIE];

        if (!token) {
          throw unauthorized();
        }

        const decoded =
          app.jwt.verify<{
            sub: string;
            accountType: string;
          }>(token);

        if (
          decoded.accountType !== "PILGRIM" ||
          !decoded.sub
        ) {
          throw unauthorized();
        }

        sub = decoded.sub;
      } catch {
        throw unauthorized();
      }

      const user = await prisma.user.findUnique({
        where: { id: sub },
      });

      if (
        !user ||
        !user.isActive ||
        user.accountType !== "PILGRIM" ||
        !user.emailVerifiedAt
      ) {
        throw unauthorized();
      }

      req.pilgrimAccount = {
        id: user.id,
      };
    }
  );

  app.decorate(
    "requirePermission",
    (permission: Permission) =>
      async (
        req: FastifyRequest,
        reply: FastifyReply
      ) => {
        await app.authenticate(req, reply);

        // Defensa en profundidad: los permisos son solo del personal; accountType no autoriza por sí mismo.
        if (req.auth.accountType !== "STAFF") {
          throw forbidden();
        }

        // A3: una organización suspendida o archivada queda en solo lectura para todo su personal.
        if (req.method !== "GET" && req.method !== "HEAD") {
          assertOrgCan(req.auth.organizationStatus, "WRITE");
        }

        if (
          !hasPermission(
            req.auth.role,
            req.auth.extraPermissions,
            permission
          )
        ) {
          throw forbidden();
        }
      }
  );

  /** A3: operador de plataforma (PLATFORM_ADMIN). Sesión propia; nunca es personal de una parroquia. */
  app.decorate(
    "authenticatePlatform",
    async (req: FastifyRequest) => {
      let sub: string;

      try {
        const token = req.cookies[PLATFORM_COOKIE];
        if (!token) {
          throw unauthorized();
        }
        const decoded = app.jwt.verify<{ sub: string; accountType: string }>(token);
        if (decoded.accountType !== "PLATFORM" || !decoded.sub) {
          throw unauthorized();
        }
        sub = decoded.sub;
      } catch {
        throw unauthorized();
      }

      const user = await prisma.user.findUnique({ where: { id: sub } });

      if (
        !user ||
        !user.isActive ||
        user.accountType !== "PLATFORM" ||
        user.organizationId ||
        user.role
      ) {
        throw unauthorized();
      }

      req.platform = { id: user.id, name: user.name, email: user.email };
    }
  );
});