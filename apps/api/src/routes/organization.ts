import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NOTICE_AUDIENCES, PARISH_IMAGE_SPEC, PARISH_POSTER_SIZES, hasPermission, multiNoticeSchema, organizationProfileSchema, sendNotificationSchema, sigypManagedFieldsIn, submitOrganizationReviewSchema, type NoticeAudience } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { AppError, forbidden } from "../lib/errors";
import { assertOrgCan, assertOrgTransition } from "../lib/orgLifecycle";
import { recordStatusChange } from "../lib/orgStatus";
import { readSingleFile, validateImage } from "../lib/image";
import { notifyAudiences, notifyFollowers, pushNotification, resolveAudiences } from "../lib/notifications";
import { buildParishPosterPdf } from "../lib/parishPoster";
import { parishMediaUrls } from "./public";

const mediaKind = z.object({ kind: z.enum(["logo", "cover"]) });
const posterQuery = z.object({ size: z.enum(PARISH_POSTER_SIZES).default("A4") });
const KIND = { logo: "PARISH_LOGO", cover: "PARISH_COVER" } as const;
const PROFILE_SELECT = {
  id: true, code: true, name: true, status: true, description: true, address: true, phone: true, email: true, website: true,
  instagram: true, facebook: true, youtube: true, tiktok: true, updatedAt: true,
  officeHours: true, profileSource: true, profileSyncedAt: true,
} as const;

/** A3 — Estado de la propia organización para su personal, y presentación a revisión por su SUPERADMIN. */
export default async function organizationRoutes(app: FastifyInstance) {
  /**
   * B1/B5: el perfil público y sus imágenes exigen parish:profile; los avisos a seguidores, notice:send. El SUPERADMIN
   * tiene ambos; a un colaborador se le otorgan por separado (PERMISSION_CATALOG).
   */
  const profileManager = app.requirePermission("parish:profile");
  const noticeSender = app.requirePermission("notice:send");
  app.get("/", { preHandler: app.authenticate }, async (req) => {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth.organizationId },
      select: {
        id: true, code: true, name: true, status: true,
        statusChanges: { orderBy: { createdAt: "desc" }, take: 1, select: { fromStatus: true, toStatus: true, reason: true, createdAt: true } },
      },
    });
    const { statusChanges, ...rest } = org;
    return { organization: { ...rest, lastChange: statusChanges[0] ?? null } };
  });

  /** DRAFT/REJECTED → PENDING_REVIEW. Solo el SUPERADMIN de la parroquia. */
  app.post("/submit-review", { preHandler: app.authenticate }, async (req) => {
    if (req.auth.role !== "SUPERADMIN") throw forbidden();
    const { note } = submitOrganizationReviewSchema.parse(req.body ?? {});
    const from = req.auth.organizationStatus;
    assertOrgCan(from, "SUBMIT_REVIEW");
    assertOrgTransition(from, "PENDING_REVIEW", "ORG_SUPERADMIN", note);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.organization.updateMany({ where: { id: req.auth.organizationId, status: from }, data: { status: "PENDING_REVIEW" } });
      if (claimed.count !== 1) throw new AppError(409, "STATUS_CHANGED", "El estado de la organización cambió. Vuelve a consultarla.");
      await recordStatusChange(tx, {
        organizationId: req.auth.organizationId, fromStatus: from, toStatus: "PENDING_REVIEW",
        actor: { id: req.auth.id, accountType: "STAFF" }, reason: note ?? "Presentada a revisión",
      });
    });
    await audit(req, { action: "ORGANIZATION_SUBMITTED_FOR_REVIEW", entityType: "Organization", entityId: req.auth.organizationId, metadata: { from } });
    return { status: "PENDING_REVIEW" };
  });

  /* ---------- B1: perfil público de la parroquia ---------- */
  async function profileView(organizationId: string) {
    const [org, followers] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: PROFILE_SELECT }),
      prisma.parishFollower.count({ where: { organizationId } }),
    ]);
    return { profile: { ...org, ...(await parishMediaUrls(organizationId)), followerCount: followers } };
  }

  app.get("/profile", { preHandler: app.authenticate }, async (req) => profileView(req.auth.organizationId));

  app.patch("/profile", { preHandler: profileManager }, async (req) => {
    const body = organizationProfileSchema.parse(req.body);
    // SIGyP: mientras el perfil lo publica SIGyP, sus campos no se editan aquí (una sola fuente de verdad).
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth.organizationId }, select: { profileSource: true } });
    const managed = org.profileSource === "SIGYP" ? sigypManagedFieldsIn(body) : [];
    if (managed.length) throw new AppError(409, "PROFILE_MANAGED_BY_SIGYP", `Estos datos se administran desde SIGyP: ${managed.join(", ")}.`);
    await prisma.organization.update({ where: { id: req.auth.organizationId }, data: body });
    await audit(req, { action: "ORGANIZATION_PROFILE_UPDATED", entityType: "Organization", entityId: req.auth.organizationId, metadata: { fields: Object.keys(body) } });
    return profileView(req.auth.organizationId);
  });

  /** Logo (cuadrado) o imagen de la parroquia (horizontal). Reemplaza la anterior; validación estricta de tipo, peso y medidas. */
  app.put("/media/:kind", { preHandler: profileManager, config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req) => {
    const { kind } = mediaKind.parse(req.params);
    const buf = await readSingleFile(req);
    const s = PARISH_IMAGE_SPEC[kind];
    const info = kind === "logo"
      ? validateImage(buf, { label: "Logo", mimes: s.mimes, maxBytes: s.maxBytes, minWidth: PARISH_IMAGE_SPEC.logo.minPx, minHeight: PARISH_IMAGE_SPEC.logo.minPx, maxPx: s.maxPx, minRatio: s.minRatio, maxRatio: s.maxRatio })
      : validateImage(buf, { label: "Imagen de la parroquia", mimes: s.mimes, maxBytes: s.maxBytes, minWidth: PARISH_IMAGE_SPEC.cover.minWidth, minHeight: PARISH_IMAGE_SPEC.cover.minHeight, maxPx: s.maxPx, minRatio: s.minRatio, maxRatio: s.maxRatio });
    await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.deleteMany({ where: { organizationId: req.auth.organizationId, kind: KIND[kind], eventId: null } });
      await tx.mediaAsset.create({
        data: { organizationId: req.auth.organizationId, kind: KIND[kind], mime: info.mime, width: info.width, height: info.height, sizeBytes: info.size, sha256: info.sha256, data: new Uint8Array(buf), createdById: req.auth.id },
      });
      await auditTx(tx, req, { action: "ORGANIZATION_MEDIA_UPLOADED", entityType: "Organization", entityId: req.auth.organizationId, metadata: { kind, width: info.width, height: info.height, bytes: info.size } });
    });
    return profileView(req.auth.organizationId);
  });

  app.delete("/media/:kind", { preHandler: profileManager }, async (req) => {
    const { kind } = mediaKind.parse(req.params);
    await prisma.mediaAsset.deleteMany({ where: { organizationId: req.auth.organizationId, kind: KIND[kind], eventId: null } });
    await audit(req, { action: "ORGANIZATION_MEDIA_REMOVED", entityType: "Organization", entityId: req.auth.organizationId, metadata: { kind } });
    return profileView(req.auth.organizationId);
  });

  /* ---------- B4: cartel institucional imprimible (A4/A3) ---------- */
  app.get("/poster.pdf", { preHandler: profileManager, config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const { size } = posterQuery.parse(req.query);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth.organizationId }, select: { name: true, code: true, address: true, status: true } });
    // El QR lleva al perfil público: sin aprobación ese perfil no existe y el cartel quedaría con un enlace roto.
    if (org.status !== "APPROVED") throw new AppError(409, "ORGANIZATION_NOT_PUBLIC", "El cartel estará disponible cuando la parroquia esté aprobada y su perfil sea público.");
    const logo = await prisma.mediaAsset.findFirst({ where: { organizationId: req.auth.organizationId, kind: "PARISH_LOGO", eventId: null }, select: { data: true, mime: true } });
    const pdf = await buildParishPosterPdf({ name: org.name, code: org.code, address: org.address, logo: logo ? { data: Buffer.from(logo.data), mime: logo.mime } : null }, size);
    await audit(req, { action: "ORGANIZATION_POSTER_EXPORTED", entityType: "Organization", entityId: req.auth.organizationId, metadata: { size } });
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="cartel-${org.code}-${size}.pdf"`)
      .header("Cache-Control", "no-store")
      .send(pdf);
  });

  /* ---------- B1: avisos a los seguidores ---------- */
  app.get("/notifications", { preHandler: noticeSender }, async (req) => {
    const items = await prisma.notification.findMany({
      where: { organizationId: req.auth.organizationId }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, kind: true, title: true, body: true, recipientCount: true, createdAt: true, delivery: true, urgent: true, audience: true, sourceSystem: true, event: { select: { id: true, name: true } }, _count: { select: { recipients: { where: { readAt: { not: null } } } } } },
    });
    return { items: items.map(({ _count, ...n }) => ({ ...n, readCount: _count.recipients })) };
  });

  /** Aviso manual a TODOS los seguidores de esta parroquia (y solo de esta). */
  app.post("/notifications", { preHandler: noticeSender, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const body = sendNotificationSchema.parse(req.body);
    assertOrgCan(req.auth.organizationStatus, "PUBLISH_EVENT");
    const n = await prisma.$transaction(async (tx) => {
      const created = await notifyFollowers(tx, { organizationId: req.auth.organizationId, kind: "MANUAL", title: body.title, body: body.body, createdById: req.auth.id });
      await auditTx(tx, req, { action: "NOTIFICATION_SENT", entityType: "Notification", entityId: created.id, metadata: { recipients: created.recipientCount } });
      return created;
    });
    // Push después de confirmar el aviso; sin esperar: un fallo de FCM no afecta al aviso ni a la respuesta.
    void pushNotification(n);
    return reply.status(201).send({ id: n.id, recipientCount: n.recipientCount });
  });

  /* ---------- Avisos multigrupo: seguidores, administración y personal por rol ---------- */

  /**
   * Grupos que ESTA persona puede usar (se comprueba en el servidor): seguidores con notice:send; personal
   * (administración y operadores) con notice:send + user:manage. Alertas urgentes: solo el SUPERADMIN.
   */
  const allowedAudiences = (req: { auth: { role: Parameters<typeof hasPermission>[0]; extraPermissions: Parameters<typeof hasPermission>[1] } }): NoticeAudience[] => {
    const send = hasPermission(req.auth.role, req.auth.extraPermissions, "notice:send");
    const staff = send && hasPermission(req.auth.role, req.auth.extraPermissions, "user:manage");
    return NOTICE_AUDIENCES.filter((a) => (a === "FOLLOWERS" ? send : staff));
  };

  /** Resumen antes de enviar: cantidad por grupo y total SIN duplicados (solo números). */
  app.get("/notifications/audiences", { preHandler: noticeSender }, async (req) => {
    const allowed = allowedAudiences(req);
    const q = z.object({ audiences: z.string().optional() }).parse(req.query);
    const chosen = (q.audiences ? q.audiences.split(",") : []).filter((a): a is NoticeAudience => (allowed as string[]).includes(a));
    const all = await resolveAudiences(prisma, req.auth.organizationId, allowed);
    const sel = chosen.length ? await resolveAudiences(prisma, req.auth.organizationId, chosen) : null;
    return { allowed, counts: all.counts, selected: chosen, uniqueRecipients: sel ? sel.userIds.length : 0, canSendUrgent: req.auth.role === "SUPERADMIN" };
  });

  /** Aviso a varios grupos: una persona en dos grupos recibe UN aviso; exige confirmar el total que se mostró. */
  app.post("/notifications/multi", { preHandler: noticeSender, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const body = multiNoticeSchema.parse(req.body);
    assertOrgCan(req.auth.organizationStatus, "PUBLISH_EVENT");
    const allowed = allowedAudiences(req);
    const denied = body.audiences.filter((a) => !allowed.includes(a));
    if (denied.length) throw new AppError(403, "AUDIENCE_NOT_ALLOWED", `No tienes permiso para enviar a: ${denied.join(", ")}.`);
    if (body.urgent && req.auth.role !== "SUPERADMIN") throw new AppError(403, "URGENT_NOT_ALLOWED", "Solo el titular de la parroquia puede enviar alertas urgentes.");
    if (body.eventId) {
      const ev = await prisma.event.findFirst({ where: { id: body.eventId, organizationId: req.auth.organizationId }, select: { id: true } });
      if (!ev) throw new AppError(404, "NOT_FOUND", "Evento no encontrado.");
    }
    const r = await prisma.$transaction(async (tx) => {
      const preview = await resolveAudiences(tx, req.auth.organizationId, body.audiences);
      // Protección contra errores de selección: el total confirmado debe ser el que hay ahora.
      if (preview.userIds.length !== body.confirmedRecipients) {
        throw new AppError(409, "RECIPIENTS_CHANGED", `Los destinatarios cambiaron: ahora son ${preview.userIds.length}. Revisa el resumen y confirma de nuevo.`);
      }
      const out = await notifyAudiences(tx, { organizationId: req.auth.organizationId, audiences: body.audiences, title: body.title, body: body.body, delivery: body.delivery, urgent: body.urgent, eventId: body.eventId ?? null, createdById: req.auth.id });
      await auditTx(tx, req, { action: body.urgent ? "NOTIFICATION_URGENT_SENT" : "NOTIFICATION_SENT", entityType: "Notification", entityId: out.notification.id, metadata: { audiences: body.audiences, counts: out.counts, recipients: out.notification.recipientCount, delivery: body.delivery, urgent: body.urgent, ...(body.urgent ? { urgentReason: body.urgentReason } : {}) } });
      return out;
    });
    if (r.notification.delivery === "PUSH") void pushNotification(r.notification);
    return reply.status(201).send({ id: r.notification.id, recipientCount: r.notification.recipientCount, counts: r.counts, delivery: r.notification.delivery });
  });
}
