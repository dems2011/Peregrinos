import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { OrganizationStatus } from "@prisma/client";
import {
  ORGANIZATION_STATUSES, loginSchema, organizationTransitionSchema, platformApproveSchema, platformRejectSchema,
} from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound, unauthorized } from "../lib/errors";
import { dummyHash, verifyPassword } from "../lib/password";
import { newOpaqueToken } from "../lib/tokens";
import { sendInvitationEmail } from "../lib/mailer";
import { clearPlatformSession, issuePlatformSession } from "../lib/session";
import { assertOrgTransition } from "../lib/orgLifecycle";
import { recordStatusChange } from "../lib/orgStatus";

/**
 * A3 — Operador de plataforma (PLATFORM_ADMIN): revisa solicitudes de parroquia y gobierna el ciclo de vida
 * de las organizaciones. Sesión propia (cookie pg_pl, 30 min). No es personal de ninguna parroquia.
 */
const idParam = z.object({ id: z.string().uuid() });
const statusQuery = z.object({ status: z.enum(ORGANIZATION_STATUSES).optional() }).strict();
const inviteUrl = (raw: string) => `${cfg.WEB_ORIGIN}/invitacion?token=${raw}`;
const actorOf = (req: FastifyRequest) => ({ id: req.platform.id, accountType: "PLATFORM" as const });
const platformAudit = (req: FastifyRequest, input: Parameters<typeof audit>[1]) => audit(req, { ...input, userId: req.platform.id });

export default async function platformRoutes(app: FastifyInstance) {
  const strict = { rateLimit: { max: 10, timeWindow: "1 minute" } };
  const guard = { preHandler: app.authenticatePlatform };

  /* ---------- Sesión ---------- */
  app.post("/login", { config: strict }, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(await dummyHash(), password), false);
    if (!user || !ok || !user.isActive || user.accountType !== "PLATFORM") {
      await audit(req, { action: "PLATFORM_LOGIN_FAILED", entityType: "User", entityId: user?.id, userId: user?.id, metadata: { email } });
      throw unauthorized("Correo o contraseña incorrectos.");
    }
    issuePlatformSession(app, reply, user);
    await audit(req, { action: "PLATFORM_LOGIN", entityType: "User", entityId: user.id, userId: user.id });
    return { user: { id: user.id, name: user.name, email: user.email, accountType: "PLATFORM" } };
  });

  app.post("/logout", async (_req, reply) => {
    clearPlatformSession(reply);
    return reply.status(204).send();
  });

  app.get("/me", guard, async (req) => ({ user: { ...req.platform, accountType: "PLATFORM" } }));

  /* ---------- Solicitudes de parroquia ---------- */
  app.get("/requests", guard, async (req) => {
    const { status } = statusQuery.parse(req.query);
    const items = await prisma.organizationRequest.findMany({
      where: status ? { status } : {}, orderBy: { createdAt: "asc" }, take: 200,
      select: {
        id: true, parishName: true, contactName: true, contactEmail: true, contactPhone: true, countryCode: true, locality: true,
        address: true, notes: true, status: true, rejectionReason: true, submissionCount: true, organizationId: true, createdAt: true, updatedAt: true,
      },
    });
    return { items };
  });

  app.get("/requests/:id", guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const request = await prisma.organizationRequest.findUnique({
      where: { id }, include: { statusChanges: { orderBy: { createdAt: "asc" } } },
    });
    if (!request) throw notFound("Solicitud no encontrada.");
    const { editTokenHash: _hidden, ...rest } = request;
    return { request: rest };
  });

  /** Aprobar: crea la Organization (APPROVED) y la invitación de FUNDADOR (único camino de invitación a SUPERADMIN). */
  app.post("/requests/:id/approve", guard, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { note } = platformApproveSchema.parse(req.body ?? {});
    const request = await prisma.organizationRequest.findUnique({ where: { id } });
    if (!request) throw notFound("Solicitud no encontrada.");
    if (request.status !== "PENDING_REVIEW") throw new AppError(409, "REQUEST_NOT_PENDING", "Solo se puede aprobar una solicitud pendiente de revisión.");
    // A2: una identidad tiene un único tipo de cuenta. El responsable necesita un correo que no esté en uso.
    if (await prisma.user.findUnique({ where: { email: request.contactEmail } })) {
      throw new AppError(409, "CONTACT_EMAIL_IN_USE", "El correo del responsable ya tiene una cuenta en Peregrinos. Pide un correo distinto para la cuenta del personal.");
    }
    const token = newOpaqueToken();
    const result = await prisma.$transaction(async (tx) => {
      // La organización se crea primero: la BD exige que una solicitud APPROVED tenga su organización.
      // Si el reclamo atómico falla (otro operador decidió antes), la transacción revierte también la organización.
      const address = [request.address, request.locality, request.countryCode].filter(Boolean).join(", ");
      const organization = await tx.organization.create({
        data: { name: request.parishName, email: request.contactEmail, phone: request.contactPhone, address: address || null, status: "APPROVED" },
      });
      const claimed = await tx.organizationRequest.updateMany({
        where: { id, status: "PENDING_REVIEW" },
        data: { status: "APPROVED", organizationId: organization.id, reviewedById: req.platform.id, reviewedAt: new Date() },
      });
      if (claimed.count !== 1) throw new AppError(409, "REQUEST_NOT_PENDING", "La solicitud cambió de estado.");
      await recordStatusChange(tx, { requestId: id, fromStatus: "PENDING_REVIEW", toStatus: "APPROVED", actor: actorOf(req), reason: note });
      await recordStatusChange(tx, { organizationId: organization.id, requestId: id, fromStatus: null, toStatus: "APPROVED", actor: actorOf(req), reason: note ?? "Alta por aprobación de solicitud" });
      const invitation = await tx.invitation.create({
        data: {
          organizationId: organization.id, email: request.contactEmail, role: "SUPERADMIN", platformGrant: true,
          tokenHash: token.hash, expiresAt: new Date(Date.now() + cfg.INVITE_TTL_DAYS * 86_400_000), invitedById: req.platform.id,
          lastSentAt: new Date(), sendCount: 1,
        },
      });
      return { organization, invitation };
    });
    const emailSent = await sendInvitationEmail({
      to: request.contactEmail, orgName: result.organization.name, inviterName: "El equipo de Peregrinos", role: "SUPERADMIN",
      url: inviteUrl(token.raw), days: cfg.INVITE_TTL_DAYS,
    });
    await platformAudit(req, {
      action: "ORGANIZATION_REQUEST_APPROVED", entityType: "OrganizationRequest", entityId: id, organizationId: result.organization.id,
      metadata: { invitationId: result.invitation.id },
    });
    return reply.status(201).send({
      organization: { id: result.organization.id, name: result.organization.name, status: result.organization.status },
      invitation: { id: result.invitation.id, email: result.invitation.email, role: result.invitation.role, expiresAt: result.invitation.expiresAt },
      inviteUrl: inviteUrl(token.raw), emailSent,
    });
  });

  app.post("/requests/:id/reject", guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const { reason } = platformRejectSchema.parse(req.body);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.organizationRequest.updateMany({
        where: { id, status: "PENDING_REVIEW" }, data: { status: "REJECTED", rejectionReason: reason, reviewedById: req.platform.id, reviewedAt: new Date() },
      });
      if (claimed.count !== 1) {
        if (!(await tx.organizationRequest.findUnique({ where: { id } }))) throw notFound("Solicitud no encontrada.");
        throw new AppError(409, "REQUEST_NOT_PENDING", "Solo se puede rechazar una solicitud pendiente de revisión.");
      }
      await recordStatusChange(tx, { requestId: id, fromStatus: "PENDING_REVIEW", toStatus: "REJECTED", actor: actorOf(req), reason });
    });
    await platformAudit(req, { action: "ORGANIZATION_REQUEST_REJECTED", entityType: "OrganizationRequest", entityId: id, metadata: { reason } });
    return { id, status: "REJECTED" };
  });

  /** Reenviar la invitación de fundador (enlace nuevo; el anterior deja de funcionar). Solo PLATFORM. */
  app.post("/requests/:id/resend-invitation", guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const request = await prisma.organizationRequest.findUnique({ where: { id }, include: { organization: true } });
    if (!request?.organization) throw notFound("Solicitud aprobada no encontrada.");
    const inv = await prisma.invitation.findFirst({
      where: { organizationId: request.organization.id, platformGrant: true, acceptedAt: null, revokedAt: null }, orderBy: { createdAt: "desc" },
    });
    if (!inv) throw new AppError(409, "NO_PENDING_FOUNDER_INVITATION", "No hay una invitación de fundador pendiente.");
    if (request.organization.status !== "APPROVED") throw new AppError(409, "ORGANIZATION_NOT_APPROVED", "La parroquia no está aprobada.");
    const token = newOpaqueToken();
    await prisma.invitation.update({
      where: { id: inv.id },
      data: { tokenHash: token.hash, expiresAt: new Date(Date.now() + cfg.INVITE_TTL_DAYS * 86_400_000), lastSentAt: new Date(), sendCount: { increment: 1 } },
    });
    const emailSent = await sendInvitationEmail({
      to: inv.email, orgName: request.organization.name, inviterName: "El equipo de Peregrinos", role: "SUPERADMIN", url: inviteUrl(token.raw), days: cfg.INVITE_TTL_DAYS,
    });
    await platformAudit(req, { action: "FOUNDER_INVITATION_RESENT", entityType: "Invitation", entityId: inv.id, organizationId: request.organization.id });
    return { inviteUrl: inviteUrl(token.raw), emailSent };
  });

  /* ---------- Organizaciones ---------- */
  app.get("/organizations", guard, async (req) => {
    const { status } = statusQuery.parse(req.query);
    const items = await prisma.organization.findMany({
      where: status ? { status } : {}, orderBy: { createdAt: "asc" }, take: 500,
      select: { id: true, name: true, status: true, isActive: true, createdAt: true, _count: { select: { users: true, events: true } } },
    });
    return { items };
  });

  app.get("/organizations/:id", guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const organization = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, isActive: true, createdAt: true, statusChanges: { orderBy: { createdAt: "asc" } } },
    });
    if (!organization) throw notFound("Organización no encontrada.");
    return { organization };
  });

  /** Transiciones de PLATFORM (aprobar/rechazar revisión, suspender, archivar, reabrir revisión de una suspendida). */
  app.post("/organizations/:id/transition", guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const { to, reason } = organizationTransitionSchema.parse(req.body);
    const org = await prisma.organization.findUnique({ where: { id }, select: { status: true } });
    if (!org) throw notFound("Organización no encontrada.");
    assertOrgTransition(org.status, to, "PLATFORM", reason);
    await prisma.$transaction(async (tx) => {
      // Reclamo atómico sobre el estado leído: dos operadores no pueden aplicar transiciones en conflicto.
      const claimed = await tx.organization.updateMany({ where: { id, status: org.status }, data: { status: to as OrganizationStatus } });
      if (claimed.count !== 1) throw new AppError(409, "STATUS_CHANGED", "El estado de la organización cambió. Vuelve a consultarla.");
      await recordStatusChange(tx, { organizationId: id, fromStatus: org.status, toStatus: to, actor: actorOf(req), reason });
    });
    await platformAudit(req, { action: "ORGANIZATION_STATUS_CHANGED", entityType: "Organization", entityId: id, organizationId: id, metadata: { from: org.status, to, reason: reason ?? null } });
    return { id, from: org.status, status: to };
  });
}
