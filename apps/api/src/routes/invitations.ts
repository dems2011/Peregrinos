import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma, type Invitation } from "@prisma/client";
import { acceptInvitationSchema, canGrantRole, canInviteRole, createInvitationSchema } from "@peregrinos/shared";
import { assertInvitationAcceptable, assertNotSuperadminGrant } from "../lib/roles";
import { assertOrgCan } from "../lib/orgLifecycle";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, forbidden, notFound } from "../lib/errors";
import { hashPassword } from "../lib/password";
import { newOpaqueToken, sha256 } from "../lib/tokens";
import { sendInvitationEmail } from "../lib/mailer";
import { buildMe, issueSession } from "../lib/session";

const idParam = z.object({ id: z.string().uuid() });
const inviteUrl = (raw: string) => `${cfg.WEB_ORIGIN}/invitacion?token=${raw}`;
const statusOf = (i: Pick<Invitation, "acceptedAt" | "revokedAt" | "expiresAt">) =>
  i.acceptedAt ? "ACCEPTED" : i.revokedAt ? "REVOKED" : i.expiresAt < new Date() ? "EXPIRED" : "PENDING";
const publicView = (i: Invitation & { invitedBy?: { name: string } }) => ({
  id: i.id, email: i.email, role: i.role, extraPermissions: i.extraPermissions, checkpointIds: i.checkpointIds,
  status: statusOf(i), expiresAt: i.expiresAt, createdAt: i.createdAt, lastSentAt: i.lastSentAt, sendCount: i.sendCount,
  invitedBy: i.invitedBy?.name ?? null,
});

export default async function invitationRoutes(app: FastifyInstance) {
  const strict = { rateLimit: { max: 20, timeWindow: "1 minute" } };
  const manage = app.requirePermission("invitation:manage");

  async function deliver(inv: Invitation, raw: string, inviterName: string) {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: inv.organizationId } });
    const emailSent = await sendInvitationEmail({
      to: inv.email, orgName: org.name, inviterName, role: inv.role, url: inviteUrl(raw), days: cfg.INVITE_TTL_DAYS,
    });
    const updated = await prisma.invitation.update({
      where: { id: inv.id }, data: { lastSentAt: new Date(), sendCount: { increment: 1 } }, include: { invitedBy: { select: { name: true } } },
    });
    // El enlace se devuelve a quien invita: si el correo no llega, puede copiarlo y mandarlo por WhatsApp.
    return { invitation: publicView(updated), inviteUrl: inviteUrl(raw), emailSent };
  }

  app.get("/", { preHandler: manage }, async (req) => {
    const items = await prisma.invitation.findMany({
      where: { organizationId: req.auth.organizationId }, orderBy: { createdAt: "desc" }, take: 200,
      include: { invitedBy: { select: { name: true } } },
    });
    return { items: items.map(publicView) };
  });

  // A6 (§8.2): invitar otorga un rol → step-up.
  app.post("/", { preHandler: [manage, app.requireRecentMfa] }, async (req, reply) => {
    const body = createInvitationSchema.parse(req.body);
    assertNotSuperadminGrant(body.role, "INVITATION");
    if (!canInviteRole(req.auth.role, body.role)) throw forbidden("No puedes invitar a un nivel superior al tuyo.");
    assertOrgCan(req.auth.organizationStatus, "INVITE_STAFF");

    // Solo se informa si el correo ya es personal de ESTA organización: no se revela si existe una cuenta en otra
    // organización o una cuenta PILGRIM (anti-enumeración entre organizaciones). Si existe fuera, la aceptación falla
    // con USER_EXISTS y eso solo lo ve el dueño del buzón.
    if (await prisma.user.findFirst({ where: { email: body.email, organizationId: req.auth.organizationId }, select: { id: true } })) {
      throw new AppError(409, "USER_EXISTS", "Ya existe un usuario con ese correo.");
    }
    const pending = await prisma.invitation.findFirst({
      where: { organizationId: req.auth.organizationId, email: body.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pending) throw new AppError(409, "INVITATION_PENDING", "Ya hay una invitación pendiente para ese correo. Puedes reenviarla.");

    const checkpointIds = [...new Set(body.checkpointIds)];
    if (checkpointIds.length) {
      const found = await prisma.checkpoint.count({ where: { id: { in: checkpointIds }, event: { organizationId: req.auth.organizationId } } });
      if (found !== checkpointIds.length) throw new AppError(400, "INVALID_CHECKPOINT", "Algún punto de control no existe.");
    }

    const { raw, hash } = newOpaqueToken();
    const inv = await prisma.invitation.create({
      data: {
        organizationId: req.auth.organizationId, email: body.email, role: body.role,
        extraPermissions: body.role === "OPERATOR" ? body.extraPermissions : [], checkpointIds,
        tokenHash: hash, expiresAt: new Date(Date.now() + cfg.INVITE_TTL_DAYS * 86_400_000), invitedById: req.auth.id,
      },
    });
    await audit(req, { action: "INVITATION_CREATED", entityType: "Invitation", entityId: inv.id, metadata: { email: inv.email, role: inv.role, extraPermissions: inv.extraPermissions, checkpointIds } });
    return reply.status(201).send(await deliver(inv, raw, req.auth.name));
  });

  /** Reenviar: genera un enlace nuevo (el anterior deja de funcionar) y renueva el vencimiento. */
  app.post("/:id/resend", { preHandler: [manage, app.requireRecentMfa] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const inv = await prisma.invitation.findFirst({ where: { id, organizationId: req.auth.organizationId } });
    if (!inv) throw notFound("Invitación no encontrada.");
    if (inv.acceptedAt || inv.revokedAt) throw new AppError(409, "NOT_PENDING", "Esta invitación ya fue aceptada o revocada.");
    if (!canGrantRole(req.auth.role, inv.role)) throw forbidden();
    assertNotSuperadminGrant(inv.role, "INVITATION");
    assertOrgCan(req.auth.organizationStatus, "INVITE_STAFF");
    const { raw, hash } = newOpaqueToken();
    // Condicional: si entre tanto se aceptó o revocó, no se renueva un enlace de una invitación ya cerrada.
    const r = await prisma.invitation.updateMany({
      where: { id, organizationId: req.auth.organizationId, acceptedAt: null, revokedAt: null },
      data: { tokenHash: hash, expiresAt: new Date(Date.now() + cfg.INVITE_TTL_DAYS * 86_400_000) },
    });
    if (r.count !== 1) throw new AppError(409, "NOT_PENDING", "Esta invitación ya fue aceptada o revocada.");
    const renewed = await prisma.invitation.findUniqueOrThrow({ where: { id } });
    await audit(req, { action: "INVITATION_RESENT", entityType: "Invitation", entityId: id, metadata: { email: inv.email } });
    return deliver(renewed, raw, req.auth.name);
  });

  app.delete("/:id", { preHandler: manage }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const inv = await prisma.invitation.findFirst({ where: { id, organizationId: req.auth.organizationId } });
    if (!inv) throw notFound("Invitación no encontrada.");
    if (!canGrantRole(req.auth.role, inv.role)) throw forbidden();
    if (inv.acceptedAt) throw new AppError(409, "ALREADY_ACCEPTED", "Esta invitación ya fue aceptada.");
    // Condicional: una aceptación simultánea gana; nunca queda "revocada" una invitación ya aceptada.
    const r = await prisma.invitation.updateMany({ where: { id, organizationId: req.auth.organizationId, acceptedAt: null }, data: { revokedAt: new Date() } });
    if (r.count !== 1) throw new AppError(409, "ALREADY_ACCEPTED", "Esta invitación ya fue aceptada.");
    await audit(req, { action: "INVITATION_REVOKED", entityType: "Invitation", entityId: id, metadata: { email: inv.email } });
    return reply.status(204).send();
  });

  /* ---------- Públicas (la persona invitada aún no tiene cuenta) ---------- */

  async function findByToken(token: string) {
    const inv = await prisma.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { invitedBy: { select: { name: true, accountType: true } }, organization: true } });
    if (!inv) throw notFound("Esta invitación no es válida.");
    const st = statusOf(inv);
    if (st === "ACCEPTED") throw new AppError(410, "INVITATION_USED", "Esta invitación ya fue utilizada.");
    if (st === "REVOKED") throw new AppError(410, "INVITATION_REVOKED", "Esta invitación fue cancelada.");
    if (st === "EXPIRED") throw new AppError(410, "INVITATION_EXPIRED", "Esta invitación venció. Pide que te la reenvíen.");
    return inv;
  }

  app.get("/preview", { config: strict }, async (req) => {
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(req.query);
    const inv = await findByToken(token);
    const cps = inv.checkpointIds.length
      ? await prisma.checkpoint.findMany({ where: { id: { in: inv.checkpointIds }, event: { organizationId: inv.organizationId } }, include: { event: { select: { name: true } } } })
      : [];
    return {
      email: inv.email, role: inv.role, organization: inv.organization.name, invitedBy: inv.invitedBy.name, expiresAt: inv.expiresAt,
      checkpoints: cps.map((c) => ({ name: c.name, eventName: c.event.name })),
    };
  });

  /** Acepta la invitación: crea la cuenta con el nivel definido, asigna sus puntos e inicia sesión. */
  app.post("/accept", { config: strict }, async (req, reply) => {
    const body = acceptInvitationSchema.parse(req.body);
    const inv = await findByToken(body.token);
    // A1/A3: SUPERADMIN solo mediante la invitación de fundador emitida por PLATFORM; la organización debe estar aprobada.
    assertInvitationAcceptable({ role: inv.role, platformGrant: inv.platformGrant, inviterAccountType: inv.invitedBy.accountType, organizationStatus: inv.organization.status });
    const passwordHash = await hashPassword(body.password);
    try {
      const user = await prisma.$transaction(async (tx) => {
        // Reclamo atómico: si dos personas abren el mismo enlace a la vez, solo una lo consigue.
        const claimed = await tx.invitation.updateMany({
          // tokenHash en la condición: si se reenvió (enlace nuevo) entre la lectura y el reclamo, el enlace viejo ya no sirve.
          where: { id: inv.id, tokenHash: sha256(body.token), acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() },
        });
        if (claimed.count !== 1) throw new AppError(410, "INVITATION_USED", "Esta invitación ya fue utilizada.");
        const u = await tx.user.create({
          data: { organizationId: inv.organizationId, email: inv.email, name: body.name, role: inv.role, extraPermissions: inv.extraPermissions, passwordHash },
        });
        // Solo puntos de la organización que invita (defensa en profundidad: nunca asignaciones a eventos ajenos).
        const cps = inv.checkpointIds.length ? await tx.checkpoint.findMany({ where: { id: { in: inv.checkpointIds }, event: { organizationId: inv.organizationId } }, select: { id: true, eventId: true } }) : [];
        if (cps.length) await tx.operatorAssignment.createMany({ data: cps.map((c) => ({ userId: u.id, checkpointId: c.id, eventId: c.eventId })) });
        await tx.invitation.update({ where: { id: inv.id }, data: { acceptedUserId: u.id } });
        return u;
      });
      await audit(req, { action: "INVITATION_ACCEPTED", entityType: "User", entityId: user.id, userId: user.id, organizationId: user.organizationId, metadata: { invitationId: inv.id, role: user.role } });
      await issueSession(app, req, reply, user);
      return reply.status(201).send(await buildMe(user.id));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppError(409, "USER_EXISTS", "Ya existe un usuario con ese correo.");
      }
      throw e;
    }
  });
}
