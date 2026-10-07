import type { FastifyInstance } from "fastify";
import {
  accountEmailSchema, changePasswordSchema, deriveAttendance, loginSchema, passwordResetConfirmSchema,
} from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { AppError, unauthorized } from "../lib/errors";
import { dummyHash, hashPassword, verifyPassword } from "../lib/password";
import { newOpaqueToken, sha256 } from "../lib/tokens";
import { sendEmailVerification, sendPasswordReset } from "../lib/mailer";
import { buildPilgrimAccountMe, clearPilgrimAccountSession, issuePilgrimAccountSession } from "../lib/session";
import { answerVolunteerRequest, issueVolunteerConsentCode } from "../lib/volunteerConsent";
import { formatCode } from "../lib/pilgrim";
import { acceptUnverifiedPilgrim } from "../lib/emailPolicy";
import { z } from "zod";

/**
 * A5.0 — Área de cuenta del peregrino (PILGRIM). Prefijo /api/auth/account. Separada del panel del personal:
 *  - sesión propia (cookie pg_pa, JWT con versión de sesión `sv`); nunca crea sesiones de personal ni de PLATFORM;
 *  - las respuestas de reenvío y recuperación no revelan si un correo existe (anti-enumeración);
 *  - los tokens son aleatorios, de un solo uso, con vencimiento y solo se guarda su hash; nunca viajan en URLs de la API.
 */
const VERIFY_HOURS = 24;
const RESET_MINUTES = 30;
/** Límite por cuenta (además del límite por IP): evita usar la API para inundar un buzón. */
const MAX_TOKENS_PER_WINDOW = 3;
const TOKEN_WINDOW_MS = 60 * 60 * 1000;

const GENERIC_RESEND = "Si existe una cuenta pendiente de verificación con ese correo, te enviamos un enlace nuevo.";
const GENERIC_RESET = "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña.";
/** Cuentas que pueden recuperar la contraseña por correo (el operador de plataforma no). */
const RESETTABLE: readonly string[] = ["PILGRIM", "STAFF"];

export default async function pilgrimAccountRoutes(app: FastifyInstance) {
  const limit = (max: number, timeWindow: string) => ({ config: { rateLimit: { max, timeWindow } } });

  /** Ingreso exclusivo de cuentas PILGRIM. Credenciales del personal o de PLATFORM → 401 genérico (sin sesión). */
  app.post("/login", limit(10, "1 minute"), async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const found = await prisma.user.findUnique({ where: { email } });
    // Mismo costo con o sin usuario (no revela si el correo existe por tiempo de respuesta).
    const ok = found ? await verifyPassword(found.passwordHash, password) : (await verifyPassword(await dummyHash(), password), false);
    // BETA (PILGRIM_EMAIL_VERIFICATION=optional, sin SMTP): la contraseña correcta activa la cuenta sin verificar.
    const user = ok && found ? ((await acceptUnverifiedPilgrim(found)) ?? found) : found;
    const pilgrim = !!user && user.accountType === "PILGRIM" && user.isActive;
    if (!ok || !pilgrim || !user.emailVerifiedAt) {
      await audit(req, { action: "LOGIN_FAILED", entityType: "User", entityId: user?.id, userId: user?.id, organizationId: user?.organizationId, metadata: { email, area: "PILGRIM_ACCOUNT" } });
      // El aviso de verificación solo con la contraseña correcta de una cuenta de peregrino activa.
      if (ok && pilgrim && !user.emailVerifiedAt) {
        throw new AppError(401, "EMAIL_NOT_VERIFIED", "Debes verificar tu correo antes de ingresar.");
      }
      throw unauthorized("Correo o contraseña incorrectos.");
    }
    await issuePilgrimAccountSession(app, reply, user);
    await audit(req, { action: "LOGIN", entityType: "User", entityId: user.id, userId: user.id, organizationId: null, metadata: { accountType: "PILGRIM" } });
    return buildPilgrimAccountMe(user.id);
  });

  /** Reenvío del correo de verificación. Respuesta siempre igual; solo actúa sobre cuentas PILGRIM activas sin verificar. */
  app.post("/resend-verification", limit(5, "15 minutes"), async (req, reply) => {
    const { email } = accountEmailSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.accountType === "PILGRIM" && user.isActive && !user.emailVerifiedAt) {
      const now = new Date();
      const recent = await prisma.emailVerificationToken.count({ where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - TOKEN_WINDOW_MS) } } });
      if (recent < MAX_TOKENS_PER_WINDOW) {
        const token = newOpaqueToken();
        await prisma.$transaction(async (tx) => {
          // El enlace anterior deja de servir: solo vale el último.
          await tx.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
          await tx.emailVerificationToken.create({ data: { userId: user.id, tokenHash: token.hash, expiresAt: new Date(now.getTime() + VERIFY_HOURS * 3_600_000) } });
          await auditTx(tx, req, { action: "EMAIL_VERIFICATION_RESENT", entityType: "User", entityId: user.id, userId: user.id, organizationId: null });
        });
        // En segundo plano: la respuesta tarda lo mismo exista o no la cuenta. El error nunca incluye el enlace.
        void sendEmailVerification({ to: user.email, name: user.name, url: `${cfg.WEB_ORIGIN}/verificar-email?token=${encodeURIComponent(token.raw)}`, hours: VERIFY_HOURS })
          .catch(() => req.log.warn("No se pudo enviar el correo de verificación."));
      }
    }
    return reply.status(202).send({ message: GENERIC_RESEND });
  });

  /**
   * Pedido de recuperación. Respuesta siempre igual (no permite enumerar cuentas).
   * Sirve a las cuentas de peregrino y del personal (ingreso único); nunca a PLATFORM. El MFA, si está activo, se sigue
   * exigiendo al ingresar: recuperar la contraseña no saltea el segundo factor.
   */
  app.post("/password-reset/request", limit(5, "15 minutes"), async (req, reply) => {
    const { email } = accountEmailSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && RESETTABLE.includes(user.accountType) && user.isActive) {
      const now = new Date();
      const recent = await prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - TOKEN_WINDOW_MS) } } });
      if (recent < MAX_TOKENS_PER_WINDOW) {
        const token = newOpaqueToken();
        await prisma.$transaction(async (tx) => {
          await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
          await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: token.hash, expiresAt: new Date(now.getTime() + RESET_MINUTES * 60_000) } });
          await auditTx(tx, req, { action: "PASSWORD_RESET_REQUESTED", entityType: "User", entityId: user.id, userId: user.id, organizationId: user.organizationId });
        });
        // El token va en el fragmento (#): el navegador no lo envía al servidor web ni queda en sus logs.
        void sendPasswordReset({ to: user.email, name: user.name, url: `${cfg.WEB_ORIGIN}/cuenta/restablecer#token=${encodeURIComponent(token.raw)}`, minutes: RESET_MINUTES })
          .catch(() => req.log.warn("No se pudo enviar el correo de recuperación."));
      }
    }
    return reply.status(202).send({ message: GENERIC_RESET });
  });

  /**
   * Restablecer con el token: un solo uso (consumo condicional), vencimiento, solo cuentas PILGRIM o STAFF activas.
   * Invalida todas las sesiones de la cuenta (sessionVersion + 1; en el personal también sus refresh tokens) y los demás
   * enlaces pendientes.
   */
  app.post("/password-reset/confirm", limit(10, "15 minutes"), async (req, reply) => {
    const { token, password } = passwordResetConfirmSchema.parse(req.body);
    const passwordHash = await hashPassword(password);
    const invalid = () => new AppError(400, "INVALID_RESET_TOKEN", "El enlace no es válido o ya venció. Pide uno nuevo.");
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const row = await tx.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
      if (!row || row.usedAt || row.expiresAt <= now || !RESETTABLE.includes(row.user.accountType) || !row.user.isActive) throw invalid();
      const used = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (used.count !== 1) throw invalid();
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      // Personal: también se cierran sus sesiones renovables (refresh tokens).
      if (row.user.accountType === "STAFF") await tx.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
      await auditTx(tx, req, { action: "PASSWORD_RESET", entityType: "User", entityId: row.userId, userId: row.userId, organizationId: row.user.organizationId });
    });
    clearPilgrimAccountSession(reply);
    return { message: "Contraseña actualizada. Ingresa con tu contraseña nueva." };
  });

  /**
   * Cambio de contraseña con la sesión iniciada: exige la actual. Invalida las demás sesiones (sessionVersion + 1)
   * y renueva la de este dispositivo.
   */
  app.post("/password", { preHandler: app.authenticatePilgrimAccount, ...limit(10, "15 minutes") }, async (req, reply) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.pilgrimAccount.id } });
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new AppError(400, "WRONG_PASSWORD", "La contraseña actual no es correcta.");
    }
    const passwordHash = await hashPassword(newPassword);
    const updated = await prisma.$transaction(async (tx) => {
      // Condicional sobre la versión leída: dos cambios simultáneos no se pisan.
      const r = await tx.user.updateMany({ where: { id: user.id, sessionVersion: user.sessionVersion }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      if (r.count !== 1) throw new AppError(409, "ACCOUNT_CHANGED", "La cuenta cambió. Vuelve a ingresar.");
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date() } });
      await auditTx(tx, req, { action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id, userId: user.id, organizationId: null });
      return tx.user.findUniqueOrThrow({ where: { id: user.id } });
    });
    // Este dispositivo sigue con sesión (nueva versión); las demás sesiones quedan invalidadas.
    await issuePilgrimAccountSession(app, reply, updated);
    return { message: "Contraseña actualizada." };
  });

  /**
   * A5.1 — Código para que una organización pida sumar a esta persona como voluntaria. Un solo uso, vence, solo se
   * guarda el hash y se muestra una vez. Generar uno nuevo invalida el anterior sin canjear. El canje solo crea una
   * solicitud: el voluntariado existe recién cuando la persona la acepta (abajo).
   */
  app.post("/volunteer-consent-code", { preHandler: app.authenticatePilgrimAccount, ...limit(5, "15 minutes") }, async (req, reply) => {
    const issued = await prisma.$transaction(async (tx) => {
      const c = await issueVolunteerConsentCode(tx, req.pilgrimAccount.id);
      await auditTx(tx, req, { action: "VOLUNTEER_CONSENT_CODE_ISSUED", entityType: "VolunteerConsentCode", entityId: c.id, userId: req.pilgrimAccount.id, organizationId: null, metadata: { expiresAt: c.expiresAt.toISOString() } });
      return c;
    });
    reply.header("Cache-Control", "no-store");
    return { code: formatCode(issued.code), expiresAt: issued.expiresAt };
  });

  /** A5.1 — Solicitudes pendientes de esta cuenta: qué organización y qué evento quieren sumarla como voluntaria. */
  app.get("/volunteer-requests", { preHandler: app.authenticatePilgrimAccount }, async (req) => {
    const rows = await prisma.volunteerConsentCode.findMany({
      where: { userId: req.pilgrimAccount.id, usedAt: { not: null }, acceptedAt: null, declinedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true, usedAt: true, expiresAt: true,
        event: { select: { id: true, name: true, startsAt: true, endsAt: true, timezone: true, parishName: true, organization: { select: { name: true } } } },
      },
      orderBy: { usedAt: "desc" },
    });
    return {
      items: rows.filter((r) => r.event).map((r) => ({
        id: r.id, requestedAt: r.usedAt, expiresAt: r.expiresAt,
        event: { id: r.event!.id, name: r.event!.name, startsAt: r.event!.startsAt, endsAt: r.event!.endsAt, timezone: r.event!.timezone },
        organization: r.event!.parishName ?? r.event!.organization.name,
      })),
    };
  });

  /** A5.1 — Aceptar (crea el voluntariado con su Person) o rechazar una solicitud propia y pendiente. Auditado. */
  const requestParam = z.object({ id: z.string().uuid() });
  for (const accept of [true, false]) {
    app.post(`/volunteer-requests/:id/${accept ? "accept" : "decline"}`, { preHandler: app.authenticatePilgrimAccount, ...limit(20, "15 minutes") }, async (req) => {
      const { id } = requestParam.parse(req.params);
      const userId = req.pilgrimAccount.id;
      const r = await prisma.$transaction(async (tx) => {
        const out = await answerVolunteerRequest(tx, userId, id, accept);
        await auditTx(tx, req, { action: accept ? "VOLUNTEER_CONSENT_ACCEPTED" : "VOLUNTEER_CONSENT_DECLINED", entityType: "VolunteerConsentCode", entityId: out.requestId, eventId: out.eventId, userId, organizationId: out.organizationId });
        if (out.volunteerId) {
          await auditTx(tx, req, { action: "VOLUNTEER_CREATED", entityType: "VolunteerParticipation", entityId: out.volunteerId, eventId: out.eventId, userId, organizationId: out.organizationId, metadata: { personId: out.personId, status: "APPROVED", via: "CONSENT_CODE", consentRequestId: out.requestId } });
        }
        return out;
      });
      return { status: accept ? "ACCEPTED" : "DECLINED", volunteerId: r.volunteerId };
    });
  }

  /** Historial (solo lectura) de la Person vinculada a esta cuenta. Nunca datos de otras Personas. */
  app.get("/history", { preHandler: app.authenticatePilgrimAccount }, async (req) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.pilgrimAccount.id }, select: { personId: true } });
    if (!user.personId) return { person: null, participations: [], registrations: [], volunteering: [] };
    const event = { select: { id: true, name: true, type: true, status: true, startsAt: true, endsAt: true, timezone: true, parishName: true, organization: { select: { name: true } } } } as const;
    const [person, participants, registrations, volunteering] = await Promise.all([
      prisma.person.findUniqueOrThrow({ where: { id: user.personId }, select: { id: true, firstName: true, lastName: true } }),
      prisma.participant.findMany({
        where: { personId: user.personId },
        select: { id: true, number: true, status: true, createdAt: true, event, _count: { select: { checkins: { where: { status: "ACTIVE" } } } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.registration.findMany({
        where: { personId: user.personId },
        select: { id: true, status: true, createdAt: true, updatedAt: true, participantId: true, event },
        orderBy: { createdAt: "desc" },
      }),
      // A5.1: voluntariado de la misma Person (con sus asignaciones vigentes: qué, dónde, cuándo, con quién).
      prisma.volunteerParticipation.findMany({
        where: { personId: user.personId },
        select: {
          id: true, status: true, createdAt: true, event,
          assignments: {
            where: { revokedAt: null },
            select: { id: true, dutyFunction: { select: { name: true } }, team: { select: { name: true } }, zone: { select: { name: true } }, shift: { select: { name: true, startsAt: true, endsAt: true, cancelledAt: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const eventView = (e: (typeof participants)[number]["event"]) => ({
      id: e.id, name: e.name, type: e.type, status: e.status, startsAt: e.startsAt, endsAt: e.endsAt, timezone: e.timezone,
      organization: e.parishName ?? e.organization.name,
    });
    return {
      person,
      participations: participants.map((p) => ({
        id: p.id, number: p.number, status: p.status, since: p.createdAt, event: eventView(p.event),
        attendance: deriveAttendance({ eventStatus: p.event.status, participantStatus: p.status, activeCheckins: p._count.checkins }),
      })),
      registrations: registrations.map((r) => ({
        id: r.id, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt, confirmed: !!r.participantId, event: eventView(r.event),
      })),
      volunteering: volunteering.map((v) => ({
        id: v.id, status: v.status, since: v.createdAt, event: eventView(v.event),
        assignments: v.assignments.map((a) => ({
          id: a.id, function: a.dutyFunction.name, team: a.team?.name ?? null, zone: a.zone?.name ?? null,
          shift: a.shift ? { name: a.shift.name, startsAt: a.shift.startsAt, endsAt: a.shift.endsAt, cancelled: !!a.shift.cancelledAt } : null,
        })),
      })),
    };
  });
}
