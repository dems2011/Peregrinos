import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bulletinPublishSchema, bulletinSchema } from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { assertOrgCan } from "../lib/orgLifecycle";
import { notifyFollowers, pushNotification } from "../lib/notifications";
import { sendBulletinEmail } from "../lib/mailer";
import { bulletinSections, bulletinText } from "../lib/bulletins";

const idParam = z.object({ id: z.string().uuid() });
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

/**
 * B5 — Boletín parroquial (prefijo /api/organization/bulletins). Permiso notice:send (el mismo de los avisos: el boletín
 * es una forma consolidada de comunicar a los seguidores). Publicar reutiliza los avisos (bandeja + push) y, para quien
 * lo pidió (ParishFollower.bulletinEmail, correo verificado), el correo. No hay otra base de suscriptores.
 */
export default async function bulletinRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("notice:send");
  const own = async (organizationId: string, id: string) => {
    const b = await prisma.bulletin.findFirst({ where: { id, organizationId } });
    if (!b) throw notFound("Boletín no encontrado.");
    return b;
  };

  app.get("/", { preHandler: manage }, async (req) => {
    const [items, emailSubscribers] = await Promise.all([
      prisma.bulletin.findMany({ where: { organizationId: req.auth.organizationId }, orderBy: [{ weekOf: "desc" }, { createdAt: "desc" }], take: 50 }),
      prisma.parishFollower.count({ where: { organizationId: req.auth.organizationId, bulletinEmail: true, user: { isActive: true, emailVerifiedAt: { not: null } } } }),
    ]);
    return { items, emailSubscribers };
  });

  app.get("/:id/preview", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = await own(req.auth.organizationId, id);
    const sections = await bulletinSections(req.auth.organizationId, b);
    return { bulletin: b, sections, text: bulletinText(b.body, sections) };
  });

  app.post("/", { preHandler: manage }, async (req, reply) => {
    const v = bulletinSchema.parse(req.body);
    const b = await prisma.bulletin.create({
      data: { organizationId: req.auth.organizationId, title: v.title, weekOf: day(v.weekOf), body: v.body, includeSchedule: v.includeSchedule ?? true, includeEvents: v.includeEvents ?? true, includeCampaigns: v.includeCampaigns ?? false, createdById: req.auth.id },
    });
    await audit(req, { action: "BULLETIN_CREATED", entityType: "Bulletin", entityId: b.id });
    return reply.status(201).send(b);
  });

  /** Solo se editan borradores (lo publicado ya llegó a los seguidores). */
  app.put("/:id", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    const v = bulletinSchema.parse(req.body);
    const r = await prisma.bulletin.updateMany({
      where: { id, organizationId: req.auth.organizationId, status: "DRAFT" },
      data: { title: v.title, weekOf: day(v.weekOf), body: v.body, includeSchedule: v.includeSchedule ?? true, includeEvents: v.includeEvents ?? true, includeCampaigns: v.includeCampaigns ?? false },
    });
    if (r.count !== 1) throw new AppError(409, "NOT_DRAFT", "Solo se puede editar un boletín en borrador.");
    await audit(req, { action: "BULLETIN_UPDATED", entityType: "Bulletin", entityId: id });
    return prisma.bulletin.findUniqueOrThrow({ where: { id } });
  });

  app.delete("/:id", { preHandler: manage }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const r = await prisma.bulletin.deleteMany({ where: { id, organizationId: req.auth.organizationId, status: "DRAFT" } });
    if (r.count !== 1) throw new AppError(409, "NOT_DRAFT", "Solo se puede borrar un boletín en borrador.");
    await audit(req, { action: "BULLETIN_DELETED", entityType: "Bulletin", entityId: id });
    return reply.status(204).send();
  });

  /** Publicar: aviso a los seguidores (bandeja + push) y, si se pide, correo a quienes lo eligieron. Una sola vez. */
  app.post("/:id/publish", { preHandler: manage, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { sendEmail } = bulletinPublishSchema.parse(req.body ?? {});
    const b = await own(req.auth.organizationId, id);
    assertOrgCan(req.auth.organizationStatus, "PUBLISH_EVENT");
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.auth.organizationId }, select: { id: true, name: true } });
    const n = await prisma.$transaction(async (tx) => {
      const claimed = await tx.bulletin.updateMany({ where: { id, status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      if (claimed.count !== 1) throw new AppError(409, "NOT_DRAFT", "Este boletín ya fue publicado.");
      const created = await notifyFollowers(tx, {
        organizationId: org.id, kind: "BULLETIN", createdById: req.auth.id, title: b.title.slice(0, 120),
        body: `${org.name} publicó su boletín. ${b.body.slice(0, 400)}${b.body.length > 400 ? "…" : ""}`,
      });
      await tx.bulletin.update({ where: { id }, data: { notificationId: created.id } });
      await auditTx(tx, req, { action: "BULLETIN_PUBLISHED", entityType: "Bulletin", entityId: id, metadata: { recipients: created.recipientCount, sendEmail } });
      return created;
    });
    void pushNotification(n);
    let emailQueued = 0;
    if (sendEmail) {
      const recipients = await prisma.parishFollower.findMany({
        where: { organizationId: org.id, bulletinEmail: true, user: { isActive: true, emailVerifiedAt: { not: null } } },
        select: { user: { select: { email: true } } },
      });
      emailQueued = recipients.length;
      const text = bulletinText(b.body, await bulletinSections(org.id, b));
      const url = `${cfg.WEB_ORIGIN}/parroquias/${org.id}?boletin=${id}`;
      // En segundo plano y de a uno (no satura el SMTP); el resultado queda en emailCount/emailedAt.
      void (async () => {
        let sent = 0;
        for (const r of recipients) {
          if (await sendBulletinEmail({ to: r.user.email, parish: org.name, title: b.title, text, url, preferencesUrl: `${cfg.WEB_ORIGIN}/cuenta/parroquias` })) sent++;
        }
        await prisma.bulletin.update({ where: { id }, data: { emailedAt: new Date(), emailCount: sent } }).catch(() => undefined);
      })();
    }
    return reply.status(201).send({ recipientCount: n.recipientCount, emailQueued });
  });
}
