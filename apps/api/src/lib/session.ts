
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  effectivePermissions,
  type AssignmentView,
  type MeResponse,
  type Role,
} from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "./prisma";
import { newOpaqueToken } from "./tokens";
import { MFA_CHALLENGE_MINUTES, STEP_UP_MINUTES, isRecentMfa, mfaEnrollmentRequired } from "./mfa";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  PILGRIM_ACCOUNT_COOKIE,
  PLATFORM_COOKIE,
} from "../plugins/auth";

/** A3: duración de la sesión del operador de plataforma (corta, sin refresh). */
export const PLATFORM_SESSION_MIN = 30;

/** A3: crea la sesión del operador de plataforma. */
export function issuePlatformSession(
  app: FastifyInstance,
  reply: FastifyReply,
  user: { id: string; accountType: string }
) {
  if (user.accountType !== "PLATFORM") {
    throw new Error("La sesión de plataforma requiere una cuenta PLATFORM.");
  }
  const token = app.jwt.sign(
    { sub: user.id, accountType: "PLATFORM" },
    { expiresIn: `${PLATFORM_SESSION_MIN}m` }
  );
  reply.setCookie(PLATFORM_COOKIE, token, {
    ...cookieBase,
    path: "/api/platform",
    maxAge: PLATFORM_SESSION_MIN * 60,
  });
}

export function clearPlatformSession(reply: FastifyReply) {
  reply.clearCookie(PLATFORM_COOKIE, { path: "/api/platform" });
}

export const cookieBase = {
  httpOnly: true,
  secure: cfg.COOKIE_SECURE,
  sameSite: "lax" as const,
};

/** A6: desafío de segundo factor entre la contraseña y el código (solo /api/auth/mfa). */
export const MFA_CHALLENGE_COOKIE = "pg_mfa";
const MFA_CHALLENGE_PATH = "/api/auth/mfa";

/** Claims del access token del personal. sv: versión de sesiones (A6); mfa: segundo del último factor verificado. */
export interface StaffAccessClaims {
  sub: string;
  role: string;
  sv?: number;
  mfa?: number;
}

/**
 * A6: tras la contraseña correcta de una cuenta con MFA no se emite sesión: solo un desafío firmado y corto, en cookie
 * httpOnly limitada a /api/auth/mfa. Lleva sv para que un cambio de contraseña/MFA lo invalide.
 */
export function issueMfaChallenge(
  app: FastifyInstance,
  reply: FastifyReply,
  user: { id: string; sessionVersion: number }
) {
  const token = app.jwt.sign(
    { sub: user.id, purpose: "mfa-challenge", sv: user.sessionVersion },
    { expiresIn: `${MFA_CHALLENGE_MINUTES}m` }
  );
  reply.setCookie(MFA_CHALLENGE_COOKIE, token, {
    ...cookieBase,
    path: MFA_CHALLENGE_PATH,
    maxAge: MFA_CHALLENGE_MINUTES * 60,
  });
}

/** Devuelve el id de la cuenta del desafío vigente, o null. */
export function readMfaChallenge(app: FastifyInstance, req: FastifyRequest): { sub: string; sv: number } | null {
  const raw = req.cookies[MFA_CHALLENGE_COOKIE];
  if (!raw) return null;
  try {
    const d = app.jwt.verify<{ sub: string; purpose?: string; sv?: number }>(raw);
    return d.purpose === "mfa-challenge" && d.sub ? { sub: d.sub, sv: d.sv ?? 0 } : null;
  } catch {
    return null;
  }
}

export function clearMfaChallenge(reply: FastifyReply) {
  reply.clearCookie(MFA_CHALLENGE_COOKIE, { path: MFA_CHALLENGE_PATH });
}

/** Solo el access token del personal (step-up: la sesión y su refresh token siguen siendo los mismos). */
export function setStaffAccessToken(
  app: FastifyInstance,
  reply: FastifyReply,
  user: { id: string; role: string; sessionVersion: number },
  mfaAt: Date | null
) {
  const claims: StaffAccessClaims = { sub: user.id, role: user.role, sv: user.sessionVersion };
  if (mfaAt) claims.mfa = Math.floor(mfaAt.getTime() / 1000);
  reply.setCookie(ACCESS_COOKIE, app.jwt.sign(claims), {
    ...cookieBase,
    path: "/",
    maxAge: cfg.ACCESS_TTL_MIN * 60,
  });
}

/** Crea la sesión del personal. `mfaAt`: momento del segundo factor (login con MFA o step-up). */
export async function issueSession(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  user: { id: string; role: string | null; accountType: string; sessionVersion?: number },
  opts: { mfaAt?: Date | null } = {}
) {
  if (user.accountType !== "STAFF" || !user.role) {
    throw new Error("La sesión de personal requiere una cuenta STAFF.");
  }
  const mfaAt = opts.mfaAt ?? null;
  setStaffAccessToken(app, reply, { id: user.id, role: user.role, sessionVersion: user.sessionVersion ?? 0 }, mfaAt);
  const { raw, hash } = newOpaqueToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + cfg.REFRESH_TTL_DAYS * 86_400_000),
      userAgent: req.headers["user-agent"]?.slice(0, 300),
      ip: req.ip,
      mfaAt,
    },
  });

  reply.setCookie(REFRESH_COOKIE, raw, {
    ...cookieBase,
    path: "/api/auth",
    maxAge: cfg.REFRESH_TTL_DAYS * 86_400,
  });
}

/** Crea una sesión independiente para una cuenta de peregrino. */
export async function issuePilgrimAccountSession(
  app: FastifyInstance,
  reply: FastifyReply,
  user: { id: string; accountType: string; sessionVersion: number }
) {
  if (user.accountType !== "PILGRIM") {
    throw new Error("La sesión de peregrino requiere una cuenta de peregrino.");
  }

  // A5.0: sv = versión de sesiones de la cuenta; cambiar o restablecer la contraseña la incrementa.
  const token = app.jwt.sign(
    { sub: user.id, accountType: "PILGRIM", sv: user.sessionVersion },
    { expiresIn: `${cfg.PILGRIM_SESSION_DAYS}d` }
  );

  reply.setCookie(PILGRIM_ACCOUNT_COOKIE, token, {
    ...cookieBase,
    path: "/",
    maxAge: cfg.PILGRIM_SESSION_DAYS * 86_400,
  });
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { path: "/" });
  reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}

export function clearPilgrimAccountSession(reply: FastifyReply) {
  reply.clearCookie(PILGRIM_ACCOUNT_COOKIE, { path: "/" });
}

/** Devuelve los datos básicos de la cuenta personal del peregrino. */
export async function buildPilgrimAccountMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      documentNumber: true,
      phone: true,
      photoUrl: true,
      emailVerifiedAt: true,
      accountType: true,
      isActive: true,
      createdAt: true,
      // A4a: la identidad de la cuenta vive en Person.
      person: { select: { id: true, firstName: true, lastName: true, documentType: true, documentNumber: true, phone: true } },
    },
  });

  if (
    !user ||
    !user.isActive ||
    user.accountType !== "PILGRIM" ||
    !user.emailVerifiedAt
  ) {
    throw new Error("La cuenta de peregrino no está disponible.");
  }

  return {
    kind: "pilgrim" as const,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      // A4a: datos de identidad desde Person (User.documentNumber/phone quedan como dato heredado).
      documentNumber: user.person?.documentNumber ?? user.documentNumber,
      phone: user.person?.phone ?? user.phone,
      photoUrl: user.photoUrl,
      emailVerified: true,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    },
    // A5.0: la Person vinculada (identidad humana) tal como la guarda el servidor.
    person: user.person
      ? { id: user.person.id, firstName: user.person.firstName, lastName: user.person.lastName, documentType: user.person.documentType, documentNumber: user.person.documentNumber, phone: user.person.phone }
      : null,
  };
}

/** `mfaAt`: momento del último segundo factor de ESTA sesión (del access token), para el step-up. */
export async function buildMe(userId: string, mfaAt?: Date | null): Promise<MeResponse> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      organization: { select: { status: true } },
      _count: { select: { mfaRecoveryCodes: { where: { usedAt: null } } } },
    },
  });
  if (user.accountType !== "STAFF" || !user.role || !user.organizationId || !user.organization) {
    throw new Error("buildMe es solo para cuentas del personal.");
  }

  const rows = await prisma.operatorAssignment.findMany({
    where: { userId, checkpoint: { status: "ACTIVE" } },
    include: { checkpoint: { include: { event: true } } },
  });

  const assignments: AssignmentView[] = rows
    .map((r) => ({
      checkpointId: r.checkpointId,
      checkpointName: r.checkpoint.name,
      order: r.checkpoint.order,
      eventId: r.eventId,
      eventName: r.checkpoint.event.name,
      eventStatus: r.checkpoint.event.status,
    }))
    .sort(
      (a, b) =>
        a.eventName.localeCompare(b.eventName) || a.order - b.order
    );

  const rank = {
    DRAFT: 9,
    IN_PROGRESS: 0,
    SCHEDULED: 1,
    FINISHED: 9,
    CANCELLED: 9,
  } as const;

  const current =
    [...assignments]
      .filter((a) => rank[a.eventStatus] < 9)
      .sort(
        (a, b) =>
          rank[a.eventStatus] - rank[b.eventStatus] ||
          a.order - b.order
      )[0] ?? null;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as Role,
      organizationId: user.organizationId,
      organizationStatus: user.organization.status,
    },
    permissions: effectivePermissions(
      user.role as Role,
      user.extraPermissions
    ),
    assignments,
    currentCheckpoint: current,
    mfa: {
      enabled: !!user.mfaEnabledAt,
      enrollmentRequired: mfaEnrollmentRequired(user),
      stepUpValidUntil:
        user.mfaEnabledAt && mfaAt && isRecentMfa(Math.floor(mfaAt.getTime() / 1000))
          ? new Date(mfaAt.getTime() + STEP_UP_MINUTES * 60_000).toISOString()
          : null,
      recoveryCodesRemaining: user.mfaEnabledAt ? user._count.mfaRecoveryCodes : 0,
    },
  };
}