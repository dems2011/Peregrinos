import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { donationCampaignSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { notFound } from "../lib/errors";
import { readSingleFile } from "../lib/image";
import { contentImageUrls, contentImageUrlsFor, prepareContentImage, replaceContentImage } from "../lib/contentImages";

const idParam = z.object({ id: z.string().uuid() });

/**
 * B5 — Donaciones (prefijo /api/organization/donations). Permiso donation:manage. Cada campaña guarda SOLO su
 * configuración y el enlace de pago de Mercado Pago de la cuenta de la propia parroquia (beneficiario). Peregrinos no
 * cobra, no recibe fondos, no guarda datos de tarjetas ni credenciales de Mercado Pago y no confirma pagos.
 */
export default async function donationRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("donation:manage");
  const own = async (organizationId: string, id: string) => {
    const c = await prisma.donationCampaign.findFirst({ where: { id, organizationId } });
    if (!c) throw notFound("Campaña no encontrada.");
    return c;
  };

  app.get("/", { preHandler: manage }, async (req) => {
    const items = await prisma.donationCampaign.findMany({ where: { organizationId: req.auth.organizationId }, orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }] });
    const images = await contentImageUrlsFor("DONATION_CAMPAIGN", items.map((c) => c.id));
    return { items: items.map((c) => ({ ...c, image: images.get(c.id) ?? null })) };
  });

  app.post("/", { preHandler: manage }, async (req, reply) => {
    const b = donationCampaignSchema.parse(req.body);
    const c = await prisma.donationCampaign.create({
      data: { organizationId: req.auth.organizationId, title: b.title, purpose: b.purpose, description: b.description ?? null, beneficiary: b.beneficiary, url: b.url.trim(), active: b.active ?? false, sortOrder: b.sortOrder ?? 0, createdById: req.auth.id },
    });
    await audit(req, { action: "DONATION_CAMPAIGN_CREATED", entityType: "DonationCampaign", entityId: c.id, metadata: { active: c.active, host: new URL(c.url).hostname } });
    return reply.status(201).send({ ...c, image: null });
  });

  app.put("/:id", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = donationCampaignSchema.parse(req.body);
    const before = await own(req.auth.organizationId, id);
    const c = await prisma.donationCampaign.update({
      where: { id: before.id },
      data: { title: b.title, purpose: b.purpose, description: b.description ?? null, beneficiary: b.beneficiary, url: b.url.trim(), active: b.active ?? before.active, sortOrder: b.sortOrder ?? before.sortOrder },
    });
    // El cambio de enlace o de beneficiario es sensible: queda en la auditoría.
    await audit(req, { action: "DONATION_CAMPAIGN_UPDATED", entityType: "DonationCampaign", entityId: id, metadata: { urlChanged: before.url !== c.url, beneficiaryChanged: before.beneficiary !== c.beneficiary, active: c.active } });
    return { ...c, image: await contentImageUrls("DONATION_CAMPAIGN", id) };
  });

  app.delete("/:id", { preHandler: manage }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await own(req.auth.organizationId, id);
    await prisma.$transaction(async (tx) => {
      await tx.contentImage.deleteMany({ where: { ownerType: "DONATION_CAMPAIGN", ownerId: id } });
      await tx.donationCampaign.delete({ where: { id } });
      await auditTx(tx, req, { action: "DONATION_CAMPAIGN_DELETED", entityType: "DonationCampaign", entityId: id });
    });
    return reply.status(204).send();
  });

  app.put("/:id/image", { preHandler: manage, config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req) => {
    const { id } = idParam.parse(req.params);
    const c = await own(req.auth.organizationId, id);
    const images = await prepareContentImage("DONATION_CAMPAIGN", await readSingleFile(req));
    await prisma.$transaction(async (tx) => {
      await replaceContentImage(tx, { organizationId: c.organizationId, ownerType: "DONATION_CAMPAIGN", ownerId: id, createdById: req.auth.id, images });
      await auditTx(tx, req, { action: "DONATION_CAMPAIGN_IMAGE_UPLOADED", entityType: "DonationCampaign", entityId: id });
    });
    return { image: await contentImageUrls("DONATION_CAMPAIGN", id) };
  });

  app.delete("/:id/image", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    await own(req.auth.organizationId, id);
    await prisma.contentImage.deleteMany({ where: { ownerType: "DONATION_CAMPAIGN", ownerId: id } });
    await audit(req, { action: "DONATION_CAMPAIGN_IMAGE_REMOVED", entityType: "DonationCampaign", entityId: id });
    return { image: null };
  });
}
