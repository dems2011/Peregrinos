import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  bootstrapSchema,
  loginSchema,
  registerPilgrimSchema,
} from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, unauthorized } from "../lib/errors";
import {
  dummyHash,
  hashPassword,
  verifyPassword,
} from "../lib/password";
import { newOpaqueToken, sha256 } from "../lib/tokens";
import { REFRESH_COOKIE } from "../plugins/auth";
import {
  buildMe,
  buildPilgrimAccountMe,
  clearPilgrimAccountSession,
  clearSession,
  issuePilgrimAccountSession,
  issueSession,
} from "../lib/session";
import { sendEmailVerification } from "../lib/mailer";

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

      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { documentNumber }],
        },
        select: {
          email: true,
          documentNumber: true,
        },
      });

      if (existing?.email === email) {
        throw new AppError(
          409,
          "EMAIL_EXISTS",
          "Ya existe una cuenta con ese correo."
        );
      }

      if (existing?.documentNumber === documentNumber) {
        throw new AppError(
          409,
          "DOCUMENT_EXISTS",
          "Ya existe una cuenta con ese DNI."
        );
      }

      const organization = await prisma.organization.findFirst({
        orderBy: {
          createdAt: "asc",
        },
      });

      if (!organization) {
        throw new AppError(
          503,
          "SYSTEM_NOT_INITIALIZED",
          "El sistema todavía no está inicializado."
        );
      }

      const passwordHash = await hashPassword(body.password);
      const verification = newOpaqueToken();

      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            organizationId: organization.id,
            name: `${body.firstName} ${body.lastName}`,
            email,
            documentNumber,
            phone: body.phone.trim(),
            passwordHash,
            role: "OPERATOR",
            accountType: "PILGRIM",
            termsAcceptedAt: new Date(),
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

      const verificationUrl =
        `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}` +
        `/verificar-email?token=${encodeURIComponent(
          verification.raw
        )}`;

      await sendEmailVerification({
        to: user.email,
        name: user.name,
        url: verificationUrl,
        hours: 24,
      });

      await audit(req, {
        action: "PILGRIM_REGISTERED",
        entityType: "User",
        entityId: user.id,
        organizationId: user.organizationId,
        metadata: {
          email: user.email,
          accountType: user.accountType,
        },
      });

      return reply.status(201).send({
        message:
          "Cuenta creada. Revisa tu correo para verificarla.",
        email: user.email,
      });
    }
  );

  app.get(
    "/verify-email",
    async (req, reply) => {
      const query = z
        .object({
          token: z.string().min(20),
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

      await prisma.$transaction([
        prisma.user.update({
          where: {
            id: verification.userId,
          },
          data: {
            emailVerifiedAt: new Date(),
          },
        }),
        prisma.emailVerificationToken.update({
          where: {
            id: verification.id,
          },
          data: {
            usedAt: new Date(),
          },
        }),
      ]);

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
        if ((await tx.user.count()) > 0) {
          throw new AppError(
            409,
            "ALREADY_INITIALIZED",
            "El sistema ya fue inicializado."
          );
        }

        const org = await tx.organization.create({
          data: {
            name: body.organizationName,
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

        throw unauthorized(
          user?.accountType === "PILGRIM" &&
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
        token.user.accountType !== "STAFF"
      ) {
        clearSession(reply);
        throw unauthorized();
      }

      await prisma.refreshToken.update({
        where: {
          id: token.id,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await issueSession(
        app,
        req,
        reply,
        token.user
      );

      return buildMe(token.userId);
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
    async (_req, reply) => {
      clearPilgrimAccountSession(reply);

      return reply.status(204).send();
    }
  );

  app.get(
    "/me",
    {
      preHandler: app.authenticate,
    },
    async (req) => {
      return buildMe(req.auth.id);
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