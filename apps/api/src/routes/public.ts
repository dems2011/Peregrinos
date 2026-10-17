import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { deriveRegistrationState, normalizeParishCode, type RegistrationField } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";
import { parishCodeUrl } from "../lib/parishPoster";
import { contentImageUrlsFor } from "../lib/contentImages";
import { currentLivestream } from "../lib/livestreams";

/**
 * B1 — Perfil público de las parroquias (sin sesión). Solo parroquias APROBADAS y solo eventos PÚBLICOS publicados
 * (programados o en curso). Nunca expone datos de personas, ni el personal, ni eventos privados o "solo con enlace".
 */
const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({ q: z.string().trim().max(80).optional() });
const VISIBLE_EVENT: Prisma.EventWhereInput = { visibility: "PUBLIC", status: { in: ["SCHEDULED", "IN_PROGRESS"] } };
/** B5: los eventos finalizados se siguen mostrando (como publicación) durante 90 días. */
const FINISHED_WINDOW_MS = 90 * 86_400_000;

/** URLs públicas del logo y de la imagen (con versión para que el navegador no muestre una vieja). */
export async function parishMediaUrls(organizationId: string) {
  const media = await prisma.mediaAsset.findMany({
    where: { organizationId, eventId: null, kind: { in: ["PARISH_LOGO", "PARISH_COVER"] } },
    select: { kind: true, sha256: true },
  });
  const url = (kind: string, path: string) => {
    const m = media.find((x) => x.kind === kind);
    return m ? `/api/public/parishes/${organizationId}/${path}?v=${m.sha256.slice(0, 12)}` : null;
  };
  return { logoUrl: url("PARISH_LOGO", "logo"), coverUrl: url("PARISH_COVER", "cover") };
}

export default async function publicRoutes(app: FastifyInstance) {
  const rl = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

  /**
   * Buscador de parroquias aprobadas por nombre, dirección o código institucional. Un código completo («PAR-482193»,
   * «482193») busca SOLO esa parroquia: así no se confunde con otra de nombre parecido.
   */
  app.get("/parishes", rl(60), async (req) => {
    const { q } = listQuery.parse(req.query);
    const code = q ? normalizeParishCode(q) : null;
    const orgs = await prisma.organization.findMany({
      where: {
        status: "APPROVED",
        ...(code ? { code } : q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }] } : {}),
      },
      select: {
        id: true, code: true, name: true, description: true, address: true,
        _count: { select: { followers: true, events: { where: VISIBLE_EVENT }, livestreams: { where: { status: "LIVE" } } } },
      },
      orderBy: { name: "asc" },
      take: 50,
    });
    return {
      items: await Promise.all(orgs.map(async (o) => ({
        id: o.id, code: o.code, name: o.name, address: o.address, description: o.description ? o.description.slice(0, 220) : null,
        followerCount: o._count.followers, publicEvents: o._count.events, live: o._count.livestreams > 0, ...(await parishMediaUrls(o.id)),
      }))),
    };
  });

  /** Código institucional → parroquia (enlace o QR del cartel). 404 si no existe o no está aprobada. */
  app.get("/parishes/by-code/:code", rl(60), async (req) => {
    const { code: raw } = z.object({ code: z.string().max(20) }).parse(req.params);
    const code = normalizeParishCode(raw);
    const org = code ? await prisma.organization.findFirst({ where: { code, status: "APPROVED" }, select: { id: true, code: true, name: true } }) : null;
    if (!org) throw notFound("No hay ninguna parroquia con ese código.");
    return { parish: org };
  });

  /** QR del perfil de la parroquia (el mismo del cartel), en SVG. */
  app.get("/parishes/:id/qr.svg", rl(120), async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const org = await prisma.organization.findFirst({ where: { id, status: "APPROVED" }, select: { code: true } });
    if (!org) throw notFound("Parroquia no encontrada.");
    const svg = await QRCode.toString(parishCodeUrl(org.code), { type: "svg", margin: 1, errorCorrectionLevel: "Q" });
    return reply.header("Content-Type", "image/svg+xml").header("Cache-Control", "public, max-age=3600").header("X-Content-Type-Options", "nosniff").send(svg);
  });

  /**
   * Perfil público + eventos públicos (próximos, en curso y finalizados de los últimos 90 días) con portada y estado de
   * su inscripción. B5: transmisión actual (EN VIVO / programada; null = fuera de línea), agenda, campañas de donación
   * activas y últimos boletines. Nada de personas ni datos internos.
   */
  app.get("/parishes/:id", rl(120), async (req) => {
    const { id } = idParam.parse(req.params);
    const org = await prisma.organization.findFirst({
      where: { id, status: "APPROVED" },
      select: {
        id: true, code: true, name: true, description: true, address: true, phone: true, email: true, website: true,
        instagram: true, facebook: true, youtube: true, tiktok: true, timezone: true, officeHours: true, _count: { select: { followers: true } },
      },
    });
    if (!org) throw notFound("Parroquia no encontrada.");
    const events = await prisma.event.findMany({
      where: {
        organizationId: id, visibility: "PUBLIC",
        OR: [{ status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, { status: "FINISHED", startsAt: { gte: new Date(Date.now() - FINISHED_WINDOW_MS) } }],
      },
      select: {
        id: true, name: true, description: true, type: true, status: true, startsAt: true, endsAt: true, timezone: true,
        locationName: true, address: true, capabilities: true, registrationOpen: true, registrationOpensAt: true,
        registrationClosesAt: true, capacity: true, registrationToken: true, registrationFee: true,
      },
      orderBy: { startsAt: "asc" },
    });
    const counts = events.length
      ? await prisma.participant.groupBy({ by: ["eventId"], where: { eventId: { in: events.map((e) => e.id) }, status: "ACTIVE" }, _count: { _all: true } })
      : [];
    const active = new Map(counts.map((c) => [c.eventId, c._count._all]));
    const { _count, ...profile } = org;
    const now = new Date();
    const [covers, livestream, schedule, campaigns, bulletins, announcements] = await Promise.all([
      contentImageUrlsFor("EVENT_COVER", events.map((e) => e.id)),
      currentLivestream(id),
      prisma.scheduleItem.findMany({
        where: { organizationId: id, active: true, OR: [{ weekday: { not: null } }, { date: { gte: new Date(new Date().toISOString().slice(0, 10)) } }] },
        orderBy: [{ weekday: "asc" }, { date: "asc" }, { startTime: "asc" }],
        select: { id: true, kind: true, title: true, weekday: true, date: true, startTime: true, endTime: true, location: true, notes: true },
      }),
      prisma.donationCampaign.findMany({ where: { organizationId: id, active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], select: { id: true, title: true, purpose: true, description: true, beneficiary: true, url: true } }),
      prisma.bulletin.findMany({ where: { organizationId: id, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 3, select: { id: true, title: true, weekOf: true, body: true, publishedAt: true, includeSchedule: true, includeEvents: true, includeCampaigns: true } }),
      // SIGyP: cartelera — solo avisos no retirados y vigentes AHORA (misma regla que isAnnouncementVisible).
      prisma.parishAnnouncement.findMany({
        where: { organizationId: id, withdrawnAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        orderBy: [{ startsAt: "desc" }], take: 20,
        select: { id: true, title: true, body: true, category: true, startsAt: true, endsAt: true, publishedAt: true },
      }),
    ]);
    const campaignImages = await contentImageUrlsFor("DONATION_CAMPAIGN", campaigns.map((c) => c.id));
    return {
      parish: { ...profile, followerCount: _count.followers, ...(await parishMediaUrls(id)) },
      livestream,
      schedule: schedule.map((s) => ({ ...s, date: s.date ? s.date.toISOString().slice(0, 10) : null })),
      campaigns: campaigns.map((c) => ({ ...c, image: campaignImages.get(c.id) ?? null })),
      bulletins,
      announcements,
      events: events.map((e) => {
        const activeParticipants = active.get(e.id) ?? 0;
        const registrationState = deriveRegistrationState({ ...e, activeParticipants });
        const { registrationToken, capabilities: _c, registrationOpen: _o, registrationOpensAt: _a, registrationClosesAt: _b, ...rest } = e;
        return {
          ...rest,
          registrationFee: e.registrationFee?.toString() ?? null,
          registrationState,
          spotsLeft: e.capacity != null ? Math.max(0, e.capacity - activeParticipants) : null,
          // El enlace de inscripción de un evento PÚBLICO es público por diseño: solo cuando admite inscripciones.
          registrationPath: registrationState === "OPEN" && registrationToken ? `/registro/${registrationToken}` : null,
          // B5: publicación del evento — portada y etapa (próximo / en curso / finalizado).
          cover: covers.get(e.id) ?? null,
          phase: e.status === "IN_PROGRESS" ? "IN_PROGRESS" : e.status === "FINISHED" ? "FINISHED" : "UPCOMING",
        };
      }),
    };
  });

  /**
   * B5: imágenes de contenido (solo variantes WebP sin metadatos; el original nunca es público). Portadas de eventos
   * públicos o «solo con enlace» publicados, e imágenes de campañas activas, de parroquias aprobadas.
   */
  const variantParam = idParam.extend({ variant: z.enum(["large", "medium", "small"]) });
  const sendImage = (reply: FastifyReply, m: { data: Uint8Array; mime: string; sha256: string } | null) => {
    if (!m) throw notFound("Imagen no disponible.");
    return reply.header("Content-Type", m.mime).header("Cache-Control", "public, max-age=86400, immutable").header("ETag", `"${m.sha256}"`)
      .header("X-Content-Type-Options", "nosniff").send(Buffer.from(m.data));
  };
  app.get("/events/:id/image/:variant", rl(300), async (req, reply) => {
    const { id, variant } = variantParam.parse(req.params);
    const ev = await prisma.event.findFirst({ where: { id, visibility: { in: ["PUBLIC", "UNLISTED"] }, status: { not: "DRAFT" }, organization: { status: "APPROVED" } }, select: { id: true } });
    return sendImage(reply, ev ? await prisma.contentImage.findUnique({ where: { ownerType_ownerId_variant: { ownerType: "EVENT_COVER", ownerId: id, variant: variant.toUpperCase() as "LARGE" } }, select: { data: true, mime: true, sha256: true } }) : null);
  });
  app.get("/campaigns/:id/image/:variant", rl(300), async (req, reply) => {
    const { id, variant } = variantParam.parse(req.params);
    const c = await prisma.donationCampaign.findFirst({ where: { id, active: true, organization: { status: "APPROVED" } }, select: { id: true } });
    return sendImage(reply, c ? await prisma.contentImage.findUnique({ where: { ownerType_ownerId_variant: { ownerType: "DONATION_CAMPAIGN", ownerId: id, variant: variant.toUpperCase() as "LARGE" } }, select: { data: true, mime: true, sha256: true } }) : null);
  });

  /** Imágenes públicas (logo / imagen de la parroquia aprobada), servidas desde la base con caché. */
  for (const [path, kind] of [["logo", "PARISH_LOGO"], ["cover", "PARISH_COVER"]] as const) {
    app.get(`/parishes/:id/${path}`, rl(300), async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const m = await prisma.mediaAsset.findFirst({ where: { organizationId: id, kind, eventId: null, organization: { status: "APPROVED" } }, select: { data: true, mime: true, sha256: true } });
      if (!m) throw notFound("Imagen no disponible.");
      reply.header("Content-Type", m.mime);
      reply.header("Cache-Control", "public, max-age=86400, immutable");
      reply.header("ETag", `"${m.sha256}"`);
      reply.header("X-Content-Type-Options", "nosniff");
      return reply.send(Buffer.from(m.data));
    });
  }
}

/** Campos del formulario de un evento (guardados como JSON validado al escribir). */
export const eventFormFields = (raw: unknown): RegistrationField[] => (Array.isArray(raw) ? (raw as RegistrationField[]) : []);
