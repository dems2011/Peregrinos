import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";
import {
  BREADCRUMB_MAX_DEPTH, COUNTRIES_MAX, LEVELS_MAX, type AncestorNode, type AreaCrumb, ancestorSelect, areaParamsSchema, areaQuerySchema,
  areasQuerySchema, buildBreadcrumb, countriesQuerySchema, countryParamsSchema, GEO_CACHE_CONTROL, levelsQuerySchema, normalizeName,
  pickGeoLocale, resolveLabel, sortByLabel, withHasChildren,
} from "../lib/geo";

/**
 * Catálogo geográfico público de solo lectura (ARQUITECTURA-INTERNACIONAL §6): datos de referencia, sin sesión.
 *  - Solo países habilitados (isEnabled) y áreas activas (isActive); nunca metadatos de importación (source, sourceId…).
 *  - Respuestas acotadas, orden estable y sin N+1 (hasChildren por groupBy; ancestros con profundidad fija).
 */
export default async function geoRoutes(app: FastifyInstance) {
  const rl = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

  /** Idioma efectivo: ?locale= → Accept-Language → es. */
  const localeOf = (req: FastifyRequest, queryLocale: Parameters<typeof pickGeoLocale>[0]) =>
    pickGeoLocale(queryLocale, req.headers["accept-language"]);

  // Caché breve solo para respuestas exitosas (los 4xx/429 nunca se cachean). Hook encapsulado en este plugin.
  app.addHook("onSend", async (_req, reply: FastifyReply, payload) => {
    if (reply.statusCode === 200 && !reply.hasHeader("set-cookie")) reply.header("Cache-Control", GEO_CACHE_CONTROL).header("Vary", "Accept-Language");
    return payload;
  });

  async function enabledCountry(code: string) {
    const c = await prisma.country.findFirst({ where: { code, isEnabled: true }, select: { code: true, names: true } });
    if (!c) throw notFound("País no disponible.");
    return c;
  }

  /** Países habilitados, ordenados por nombre en el idioma pedido. */
  app.get("/countries", rl(60), async (req) => {
    const locale = localeOf(req, countriesQuerySchema.parse(req.query).locale);
    const rows = await prisma.country.findMany({
      where: { isEnabled: true },
      select: { code: true, iso3: true, names: true, locales: true, currencyCode: true, phonePrefix: true, timezones: true },
      orderBy: { code: "asc" },
      take: COUNTRIES_MAX,
    });
    const countries = rows.map(({ names, ...c }) => ({ ...c, name: resolveLabel(names, locale) ?? c.code }));
    return { countries: sortByLabel(countries, locale) };
  });

  /** Niveles administrativos del país (rank 1 = superior) con su etiqueta localizada. */
  app.get("/countries/:code/levels", rl(120), async (req) => {
    const { code } = countryParamsSchema.parse(req.params);
    const locale = localeOf(req, levelsQuerySchema.parse(req.query).locale);
    const country = await enabledCountry(code);
    const levels = await prisma.countryAreaLevel.findMany({
      where: { countryCode: code },
      select: { rank: true, kind: true, labels: true, isRequired: true },
      orderBy: { rank: "asc" },
      take: LEVELS_MAX,
    });
    return {
      country: { code: country.code, name: resolveLabel(country.names, locale) ?? country.code },
      levels: levels.map(({ labels, ...l }) => ({ ...l, label: resolveLabel(labels, locale) })),
    };
  });

  /** Hijos reales de un área (o el nivel superior si no hay parentId), con filtro de texto opcional. */
  app.get("/areas", rl(240), async (req) => {
    // Los nombres de áreas no se traducen (nombre oficial); `locale` se acepta por uniformidad del cliente.
    const { country, parentId, q, limit } = areasQuerySchema.parse(req.query);
    const where: Prisma.AdministrativeAreaWhereInput = { countryCode: country, parentId: parentId ?? null, isActive: true };
    if (q) where.nameNormalized = { contains: normalizeName(q) };
    const [, parent, rows] = await Promise.all([
      enabledCountry(country),
      parentId ? prisma.administrativeArea.findFirst({ where: { id: parentId, countryCode: country, isActive: true }, select: { id: true } }) : null,
      prisma.administrativeArea.findMany({
        where,
        select: { id: true, name: true, kind: true, rank: true, isoCode: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: limit + 1,
      }),
    ]);
    if (parentId && !parent) throw notFound("Área no encontrada.");
    const truncated = rows.length > limit;
    const page = rows.slice(0, limit);
    const groups = page.length
      ? await prisma.administrativeArea.groupBy({ by: ["parentId"], where: { parentId: { in: page.map((r) => r.id) }, isActive: true }, _count: { _all: true } })
      : [];
    return { areas: withHasChildren(page, groups), truncated };
  });

  /** Un área activa con su ruta de ancestros (raíz → padre), con profundidad máxima fija. */
  app.get("/areas/:id", rl(120), async (req) => {
    const { id } = areaParamsSchema.parse(req.params);
    const locale = localeOf(req, areaQuerySchema.parse(req.query).locale);
    const area = (await prisma.administrativeArea.findFirst({
      where: { id, isActive: true, country: { isEnabled: true } },
      select: { ...(ancestorSelect(BREADCRUMB_MAX_DEPTH) as Prisma.AdministrativeAreaSelect), countryCode: true, country: { select: { names: true } } },
    })) as unknown as (AreaCrumb & { countryCode: string; country: { names: Prisma.JsonValue }; parent?: AncestorNode | null }) | null;
    if (!area) throw notFound("Área no encontrada.");
    const [kids, level] = await Promise.all([
      prisma.administrativeArea.count({ where: { parentId: id, isActive: true } }),
      prisma.countryAreaLevel.findFirst({ where: { countryCode: area.countryCode, rank: area.rank, kind: area.kind }, select: { labels: true } }),
    ]);
    const { path, truncated } = buildBreadcrumb(area);
    return {
      area: {
        id: area.id, name: area.name, kind: area.kind, rank: area.rank, isoCode: area.isoCode ?? null,
        levelLabel: resolveLabel(level?.labels, locale), hasChildren: kids > 0,
      },
      country: { code: area.countryCode, name: resolveLabel(area.country.names, locale) ?? area.countryCode },
      path,
      pathTruncated: truncated,
    };
  });
}
