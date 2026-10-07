import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { deriveRegistrationState, type RegistrationField } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";

/**
 * B1 — Perfil público de las parroquias (sin sesión). Solo parroquias APROBADAS y solo eventos PÚBLICOS publicados
 * (programados o en curso). Nunca expone datos de personas, ni el personal, ni eventos privados o "solo con enlace".
 */
const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({ q: z.string().trim().max(80).optional() });
const VISIBLE_EVENT: Prisma.EventWhereInput = { visibility: "PUBLIC", status: { in: ["SCHEDULED", "IN_PROGRESS"] } };

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

  /** Buscador de parroquias aprobadas por nombre o dirección. */
  app.get("/parishes", rl(60), async (req) => {
    const { q } = listQuery.parse(req.query);
    const orgs = await prisma.organization.findMany({
      where: {
        status: "APPROVED",
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }] } : {}),
      },
      select: { id: true, name: true, description: true, address: true, _count: { select: { followers: true, events: { where: VISIBLE_EVENT } } } },
      orderBy: { name: "asc" },
      take: 50,
    });
    return {
      items: await Promise.all(orgs.map(async (o) => ({
        id: o.id, name: o.name, address: o.address, description: o.description ? o.description.slice(0, 220) : null,
        followerCount: o._count.followers, publicEvents: o._count.events, ...(await parishMediaUrls(o.id)),
      }))),
    };
  });

  /** Perfil público + eventos públicos publicados, con el estado de su inscripción y su formulario. */
  app.get("/parishes/:id", rl(120), async (req) => {
    const { id } = idParam.parse(req.params);
    const org = await prisma.organization.findFirst({
      where: { id, status: "APPROVED" },
      select: {
        id: true, name: true, description: true, address: true, phone: true, email: true, website: true,
        instagram: true, facebook: true, youtube: true, tiktok: true, _count: { select: { followers: true } },
      },
    });
    if (!org) throw notFound("Parroquia no encontrada.");
    const events = await prisma.event.findMany({
      where: { organizationId: id, ...VISIBLE_EVENT },
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
    return {
      parish: { ...profile, followerCount: _count.followers, ...(await parishMediaUrls(id)) },
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
        };
      }),
    };
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
