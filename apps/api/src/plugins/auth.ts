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
import { AppError, forbidden, unauthorized } from "../lib/errors";
import { sha256 } from "../lib/tokens";
import { assertOrgCan } from "../lib/orgLifecycle";
import { isRecentMfa, mfaEnrollmentRequired } from "../lib/mfa";

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
  /** A6: la cuenta tiene MFA activo. */
  mfaEnabled: boolean;
  /** A6: último segundo factor verificado en esta sesión (claim `mfa` del access token) o null. */
  mfaAt: Date | null;
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

  interface FastifyContextConfig {
    /** A6: la ruta queda disponible para un SUPERADMIN que todavía debe enrolar MFA (me, logout, enrolamiento). */
    mfaEnrollment?: boolean;
  }

  interface FastifyInstance {
    /** A6: exige un segundo factor de los últimos STEP_UP_MINUTES (usar después de authenticate/requirePermission). */
    requireRecentMfa: (
      req: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;

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
      let sv: number;
      let mfaSec: number | null;

      try {
        await req.jwtVerify({ onlyCookie: true });
        const claims = req.user as { sub: string; sv?: number; mfa?: number; purpose?: string };
        // Un token con propósito (p. ej. el desafío MFA) nunca es una sesión.
        if (!claims.sub || claims.purpose) throw unauthorized();
        sub = claims.sub;
        // Tokens emitidos antes de A6 no traen sv: equivalen a la versión 0.
        sv = claims.sv ?? 0;
        mfaSec = typeof claims.mfa === "number" ? claims.mfa : null;
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
        !user.organization ||
        // A6: activar/desactivar MFA o regenerar códigos invalida las sesiones emitidas antes.
        user.sessionVersion !== sv ||
        // A6: con MFA activo, toda sesión válida nació de un segundo factor.
        (user.mfaEnabledAt && mfaSec === null)
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
        mfaEnabled: !!user.mfaEnabledAt,
        mfaAt: mfaSec !== null ? new Date(mfaSec * 1000) : null,
      };

      // A6 (§8.1): sin MFA activo, el rol SUPERADMIN no se ejerce; solo quedan las rutas de enrolamiento.
      if (mfaEnrollmentRequired(user) && !req.routeOptions.config?.mfaEnrollment) {
        throw new AppError(403, "MFA_ENROLLMENT_REQUIRED", "Activa la verificación en dos pasos para continuar.");
      }
    }
  );

  app.decorate(
    "requireRecentMfa",
    async (req: FastifyRequest) => {
      if (!req.auth) throw unauthorized();
      // Política A6: el step-up se exige a las cuentas con MFA activo (obligatorio para SUPERADMIN, recomendado para
      // ADMIN). Una cuenta sin MFA no tiene factor con qué reautenticarse.
      if (!req.auth.mfaEnabled) return;
      const sec = req.auth.mfaAt ? Math.floor(req.auth.mfaAt.getTime() / 1000) : null;
      if (!isRecentMfa(sec)) {
        throw new AppError(403, "STEP_UP_REQUIRED", "Confirma tu identidad con el código de verificación para continuar.");
      }
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
      let sv: number;

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
            sv?: number;
          }>(token);

        if (
          decoded.accountType !== "PILGRIM" ||
          !decoded.sub
        ) {
          throw unauthorized();
        }

        sub = decoded.sub;
        // Sesiones emitidas antes de A5.0 no traen sv: equivalen a la versión 0.
        sv = decoded.sv ?? 0;
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
        !user.emailVerifiedAt ||
        // A5.0: tras cambiar o restablecer la contraseña, las sesiones anteriores dejan de valer.
        user.sessionVersion !== sv
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