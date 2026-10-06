import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { cfg } from "../config";
import {
  bootstrapSchema,
  claimPersonSchema,
  loginSchema,
  registerPilgrimSchema,
} from "@peregrinos/shared";
import { claimPersonForUser, personData } from "../lib/persons";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { AppError, unauthorized } from "../lib/errors";
import {
  dummyHash,
  hashPassword,
  verifyPassword,
} from "../lib/password";
import { newOpaqueToken, sha256 } from "../lib/tokens";
import { PILGRIM_ACCOUNT_COOKIE, REFRESH_COOKIE } from "../plugins/auth";
import {
  buildMe,
  buildPilgrimAccountMe,
  clearPilgrimAccountSession,
  clearSession,
  issueMfaChallenge,
  issuePilgrimAccountSession,
  issueSession,
} from "../lib/session";
import { sendAccountExistsNotice, sendEmailVerification, sendRegistrationNotCompleted } from "../lib/mailer";

/** A5.0: respuesta única del registro (no revela si el correo o el documento ya tienen cuenta). */
const REGISTER_ACCEPTED = "Si los datos son correctos, te enviamos un correo para continuar. Revisa tu bandeja de entrada (y la carpeta de spam).";

export default async function authRoutes(app: FastifyInstance) {
  const strict = {
    rateLimit: {
      max: 10,
      timeWindow: "1 minute",
    },
  };

  app.post(
    "/register-pilgrim",
    { config: strict },
    async (req, reply) => {
      const body = registerPilgrimSchema.parse(req.body);

      const email = body.email.toLowerCase().trim();
      const documentNumber = body.documentNumber.trim();

      // A5.0: anti-enumeración. La respuesta es SIEMPRE la misma (202 + mensaje genérico), exista o no una cuenta con
      // ese correo o documento. La orientación (ingresar o recuperar) va por correo al buzón correspondiente.
      // Las unicidades de la BD se mantienen: nunca se crea un duplicado.
      const accepted = () => reply.status(202).send({ message: REGISTER_ACCEPTED });
      const passwordHash = await hashPassword(body.password); // mismo costo en todos los caminos
      const existing = await prisma.user.findFirst({
        where: { OR: [{ email }, { documentNumber }] },
        select: { id: true, email: true, name: true },
      });
      const notifyDuplicate = async (dup: { id: string; email: string; name: string } | null) => {
        if (dup?.email === email) {
          // El correo ya tiene cuenta: se avisa a ESE buzón (su dueño), con el camino para ingresar o recuperar.
          void sendAccountExistsNotice({ to: dup.email, name: dup.name, loginUrl: `${cfg.WEB_ORIGIN}/cuenta/ingresar`, recoverUrl: `${cfg.WEB_ORIGIN}/cuenta/recuperar` })
            .catch(() => req.log.warn("No se pudo enviar el aviso de cuenta existente."));
        } else {
          // El documento ya está en otra cuenta: al buzón indicado solo se le dice que no se pudo completar.
          void sendRegistrationNotCompleted({ to: email, name: body.firstName, loginUrl: `${cfg.WEB_ORIGIN}/cuenta/ingresar`, recoverUrl: `${cfg.WEB_ORIGIN}/cuenta/recuperar` })
            .catch(() => req.log.warn("No se pudo enviar el aviso de registro no completado."));
        }
        await audit(req, { action: "PILGRIM_REGISTER_DUPLICATE", entityType: "User", entityId: dup?.id ?? null, userId: null, organizationId: null, metadata: { by: dup?.email === email ? "EMAIL" : "DOCUMENT" } });
        return accepted();
      };
      if (existing) return notifyDuplicate(existing);

      const verification = newOpaqueToken();

      let user;
      try {
      user = await prisma.$transaction(async (tx) => {
        // A4a: la identidad vive en Person; toda cuenta PILGRIM nace con la suya (sin historial). La coincidencia de
        // documento o correo nunca vincula: la Person que registró una organización se reclama después, con el código
        // y desde la cuenta con el email ya verificado (POST /account/claim-person).
        const personId = (await tx.person.create({
          data: personData({ firstName: body.firstName, lastName: body.lastName, documentType: "DNI", documentNumber, phone: body.phone.trim(), email }),
        })).id;
        const created = await tx.user.create({
          data: {
            // A2: el peregrino es una identidad sin organización ni rol de personal.
            name: `${body.firstName} ${body.lastName}`,
            email,
            // Clave de unicidad de cuenta de A2 (una cuenta por documento). La identidad está en Person.
            documentNumber,
            passwordHash,
            // Fijado por el servidor (deny-by-default): el body no puede influir en el tipo de cuenta.
            accountType: "PILGRIM",
            termsAcceptedAt: new Date(),
            personId,
          },
        });

        await tx.emailVerificationToken.create({
          data: {
            userId: created.id,
            tokenHash: verification.hash,
            expiresAt: new Date(
              Date.now() + 24 * 60 * 60 * 1000
            ),
          },
        });

        return created;
      });
      } catch (e) {
        // Dos registros simultáneos con el mismo correo o documento: la BD impide el duplicado; misma respuesta.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          return notifyDuplicate(await prisma.user.findFirst({ where: { OR: [{ email }, { documentNumber }] }, select: { id: true, email: true, name: true } }));
        }
        throw e;
      }

      const verificationUrl = `${cfg.WEB_ORIGIN}/verificar-email?token=${encodeURIComponent(verification.raw)}`;

      // En segundo plano: la respuesta tarda lo mismo exista o no la cuenta.
      void sendEmailVerification({
        to: user.email,
        name: user.name,
        url: verificationUrl,
        hours: 24,
      }).catch(() => req.log.warn("No se pudo enviar el correo de verificación."));

      await audit(req, {
        action: "PILGRIM_REGISTERED",
        entityType: "User",
        entityId: user.id,
        organizationId: user.organizationId,
        metadata: {
          email: user.email,
          accountType: user.accountType,
          personId: user.personId,
        },
      });

      return accepted();
    }
  );

  /**
   * A5.0: una cuenta PILGRIM con email verificado une a su identidad global (User.personId, que no cambia) el registro
   * que una organización le asoció, con el código de un solo uso que esta le entregó y su confirmación explícita.
   * Solo se mueven los datos de esa organización; la unión queda registrada y solo esa organización puede revertirla.
   */
  app.post(
    "/account/claim-person",
    { preHandler: app.authenticatePilgrimAccount, config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req) => {
      const { code } = claimPersonSchema.parse(req.body);
      await prisma.$transaction(async (tx) => {
        const result = await claimPersonForUser(tx, req.pilgrimAccount.id, code);
        // Unión auditada en la misma transacción (qué organización, qué registro y cuánto se movió).
        await auditTx(tx, req, { action: "PERSON_CLAIMED", entityType: "Person", entityId: result.personId, userId: req.pilgrimAccount.id, organizationId: result.ownerOrganizationId, metadata: { claimId: result.claimId, sourcePersonId: result.sourcePersonId, movedParticipants: result.movedParticipants, movedRegistrations: result.movedRegistrations, movedVolunteers: result.movedVolunteers } });
      });
      return buildPilgrimAccountMe(req.pilgrimAccount.id);
    }
  );

  app.get(
    "/verify-email",
    { config: strict },
    async (req, reply) => {
      const query = z
        .object({
          token: z.string().min(20).max(200),
        })
        .parse(req.query);

      const tokenHash = sha256(query.token);

      const verification =
        await prisma.emailVerificationToken.findUnique({
          where: {
            tokenHash,
          },
          include: {
            user: true,
          },
        });

      if (
        !verification ||
        verification.usedAt ||
        verification.expiresAt < new Date() ||
        !verification.user.isActive
      ) {
        throw new AppError(
          400,
          "INVALID_VERIFICATION",
          "El enlace de verificación no es válido o ya venció."
        );
      }

      // A5.0: consumo condicional (un solo uso incluso con dos clics simultáneos) y verificación en la misma transacción.
      await prisma.$transaction(async (tx) => {
        const now = new Date();
        const used = await tx.emailVerificationToken.updateMany({
          where: { id: verification.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (used.count !== 1) {
          throw new AppError(400, "INVALID_VERIFICATION", "El enlace de verificación no es válido o ya venció.");
        }
        await tx.user.updateMany({ where: { id: verification.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
        await auditTx(tx, req, { action: "EMAIL_VERIFIED", entityType: "User", entityId: verification.userId, userId: verification.userId, organizationId: null });
      });

      return reply.send({
        message: "Correo verificado correctamente.",
      });
    }
  );

  app.post(
    "/bootstrap",
    { config: strict },
    async (req, reply) => {
      const body = bootstrapSchema.parse(req.body);
      const passwordHash = await hashPassword(body.password);

      const user = await prisma.$transaction(async (tx) => {
        // Serializa inicializaciones concurrentes: solo una puede crear el primer SUPERADMIN.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(472910001)`;
        // A2: los peregrinos pueden existir antes de la inicialización; lo que define "inicializado" es el personal.
        if ((await tx.user.count({ where: { accountType: "STAFF" } })) > 0) {
          throw new AppError(
            409,
            "ALREADY_INITIALIZED",
            "El sistema ya fue inicializado."
          );
        }

        // A3: la instalación inicial crea la organización ya aprobada (no pasa por revisión de plataforma).
        const org = await tx.organization.create({
          data: {
            name: body.organizationName,
            status: "APPROVED",
          },
        });

        return tx.user.create({
          data: {
            organizationId: org.id,
            name: body.name,
            email: body.email,
            passwordHash,
            role: "SUPERADMIN",
          },
        });
      });

      await audit(req, {
        action: "SYSTEM_BOOTSTRAP",
        entityType: "User",
        entityId: user.id,
        userId: user.id,
        organizationId: user.organizationId,
      });

      await issueSession(app, req, reply, user);

      return reply.status(201).send(
        await buildMe(user.id)
      );
    }
  );

  app.post(
    "/login",
    { config: strict },
    async (req, reply) => {
      const { email, password } =
        loginSchema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: {
          email,
        },
      });

      const ok = user
        ? await verifyPassword(
            user.passwordHash,
            password
          )
        : (
            await verifyPassword(
              await dummyHash(),
              password
            ),
            false
          );

      if (
        !user ||
        !ok ||
        !user.isActive ||
        // A3: el operador de plataforma tiene su propio login (/api/platform/login).
        user.accountType === "PLATFORM" ||
        (
          user.accountType === "PILGRIM" &&
          !user.emailVerifiedAt
        )
      ) {
        await audit(req, {
          action: "LOGIN_FAILED",
          entityType: "User",
          entityId: user?.id,
          userId: user?.id,
          organizationId: user?.organizationId,
          metadata: {
            email,
          },
        });

        // A5.0: el aviso de "verifica tu correo" solo con la contraseña correcta; si no, revelaría que la cuenta existe.
        throw unauthorized(
          ok &&
          user?.isActive &&
          user.accountType === "PILGRIM" &&
          !user.emailVerifiedAt
            ? "Debes verificar tu correo antes de ingresar."
            : "Correo o contraseña incorrectos."
        );
      }

      if (user.accountType === "PILGRIM") {
        await issuePilgrimAccountSession(
          app,
          reply,
          user
        );

        await audit(req, {
          action: "LOGIN",
          entityType: "User",
          entityId: user.id,
          userId: user.id,
          organizationId: user.organizationId,
          metadata: {
            accountType: "PILGRIM",
          },
        });

        return buildPilgrimAccountMe(user.id);
      }

      // A6: con MFA activo, la contraseña sola no abre sesión: se emite el desafío del segundo paso (/api/auth/mfa/verify).
      if (user.mfaEnabledAt) {
        issueMfaChallenge(app, reply, user);
        await audit(req, {
          action: "LOGIN_PASSWORD_OK_MFA_PENDING",
          entityType: "User",
          entityId: user.id,
          userId: user.id,
          organizationId: user.organizationId,
        });
        return { mfaRequired: true as const };
      }

      await issueSession(
        app,
        req,
        reply,
        user
      );

      await audit(req, {
        action: "LOGIN",
        entityType: "User",
        entityId: user.id,
        userId: user.id,
        organizationId: user.organizationId,
        metadata: {
          accountType: "STAFF",
        },
      });

      return buildMe(user.id);
    }
  );

  app.post(
    "/refresh",
    { config: strict },
    async (req, reply) => {
      const raw =
        req.cookies[REFRESH_COOKIE];

      if (!raw) {
        throw unauthorized();
      }

      const token =
        await prisma.refreshToken.findUnique({
          where: {
            tokenHash: sha256(raw),
          },
          include: {
            user: true,
          },
        });

      if (!token) {
        clearSession(reply);
        throw unauthorized();
      }

      if (token.revokedAt) {
        await prisma.refreshToken.updateMany({
          where: {
            userId: token.userId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });

        await audit(req, {
          action: "REFRESH_REUSE_DETECTED",
          entityType: "User",
          entityId: token.userId,
          userId: token.userId,
          organizationId: token.user.organizationId,
        });

        clearSession(reply);
        throw unauthorized();
      }

      if (
        token.expiresAt < new Date() ||
        !token.user.isActive ||
        token.user.accountType !== "STAFF" ||
        // A6: con MFA activo, solo se refresca una sesión que nació de un segundo factor.
        (token.user.mfaEnabledAt && !token.mfaAt)
      ) {
        clearSession(reply);
        throw unauthorized();
      }

      // Rotación condicional: dos refrescos simultáneos con el mismo token no generan dos sesiones. El que pierde
      // no borra cookies (las del ganador ya están en el navegador).
      const rotated = await prisma.refreshToken.updateMany({
        where: {
          id: token.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      if (rotated.count !== 1) {
        throw unauthorized();
      }

      // A6: la sesión nueva conserva el momento del último segundo factor (la ventana de step-up no se extiende).
      await issueSession(
        app,
        req,
        reply,
        token.user,
        { mfaAt: token.mfaAt }
      );

      return buildMe(token.userId, token.mfaAt);
    }
  );

  app.post(
    "/logout",
    async (req, reply) => {
      const raw =
        req.cookies[REFRESH_COOKIE];

      if (raw) {
        await prisma.refreshToken.updateMany({
          where: {
            tokenHash: sha256(raw),
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }

      clearSession(reply);

      return reply.status(204).send();
    }
  );

  app.post(
    "/account/logout",
    async (req, reply) => {
      // A5.0: logout efectivo. Si la sesión es válida, se incrementa sessionVersion (condicional sobre la versión del
      // token): cualquier copia del JWT deja de servir. Afecta solo a cuentas PILGRIM; STAFF y PLATFORM no cambian.
      // La versión es por cuenta: cerrar sesión cierra todas las sesiones de esa cuenta.
      const token = req.cookies[PILGRIM_ACCOUNT_COOKIE];
      if (token) {
        try {
          const d = app.jwt.verify<{ sub: string; accountType: string; sv?: number }>(token);
          if (d.accountType === "PILGRIM" && d.sub) {
            const r = await prisma.user.updateMany({
              where: { id: d.sub, accountType: "PILGRIM", sessionVersion: d.sv ?? 0 },
              data: { sessionVersion: { increment: 1 } },
            });
            if (r.count === 1) await audit(req, { action: "LOGOUT", entityType: "User", entityId: d.sub, userId: d.sub, organizationId: null, metadata: { accountType: "PILGRIM" } });
          }
        } catch { /* token inválido o vencido: solo se borra la cookie */ }
      }
      clearPilgrimAccountSession(reply);

      return reply.status(204).send();
    }
  );

  app.get(
    "/me",
    {
      preHandler: app.authenticate,
      // A6: un SUPERADMIN sin MFA necesita /me para saber que debe enrolarse.
      config: { mfaEnrollment: true },
    },
    async (req) => {
      return buildMe(req.auth.id, req.auth.mfaAt);
    }
  );

  app.get(
    "/account/me",
    {
      preHandler:
        app.authenticatePilgrimAccount,
    },
    async (req) => {
      return buildPilgrimAccountMe(
        req.pilgrimAccount.id
      );
    }
  );
}