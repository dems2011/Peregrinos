/**
 * Catálogo geográfico (lectura): helpers puros usados por routes/geo.ts.
 * Sin acceso a la base de datos: se prueban en test/g1-geo-api.test.ts.
 */
import { z } from "zod";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale, isLocale, resolveLocale } from "@peregrinos/shared";

/**
 * Idiomas en los que el catálogo guarda nombres/etiquetas (Country.names, CountryAreaLevel.labels).
 * Son los mismos de la app (packages/shared/src/locale.ts): una sola fuente de verdad.
 */
export const GEO_LOCALES = SUPPORTED_LOCALES;
export type GeoLocale = Locale;
export const DEFAULT_GEO_LOCALE: GeoLocale = DEFAULT_LOCALE;

/**
 * Idioma efectivo de una respuesta: `?locale=` explícito (ya validado) → Accept-Language → DEFAULT_LOCALE.
 * El encabezado se recorta para no procesar cadenas arbitrariamente largas.
 */
export function pickGeoLocale(queryLocale: GeoLocale | undefined, acceptLanguage: string | string[] | undefined): GeoLocale {
  if (queryLocale) return queryLocale;
  const header = Array.isArray(acceptLanguage) ? acceptLanguage.join(",") : acceptLanguage;
  return resolveLocale(header ? header.slice(0, 256) : null);
}

/** Límites de las respuestas. */
export const AREAS_DEFAULT_LIMIT = 50;
export const AREAS_MAX_LIMIT = 200;
export const COUNTRIES_MAX = 300;
export const LEVELS_MAX = 12;
/** Profundidad máxima de la ruta de ancestros (breadcrumb); nunca se recorre más allá. */
export const BREADCRUMB_MAX_DEPTH = 8;
/** Datos de referencia idénticos para todos (sin sesión): cacheables brevemente. Va con `Vary: Accept-Language`. */
export const GEO_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=600";

/**
 * Resuelve una etiqueta localizada de un Json {"es":"…","en":"…"}.
 * Orden: idioma pedido → es → en → pt → it → cualquier otro valor de texto no vacío → null.
 */
export function resolveLabel(json: unknown, locale: GeoLocale = DEFAULT_GEO_LOCALE): string | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const rec = json as Record<string, unknown>;
  const ok = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  for (const l of [locale, ...GEO_LOCALES]) if (ok(rec[l])) return (rec[l] as string).trim();
  for (const k of Object.keys(rec).sort()) if (ok(rec[k])) return (rec[k] as string).trim();
  return null;
}

/**
 * Misma normalización que el importador (apps/api/geo/importers/core/normalize.ts → nameNormalized):
 * NFKD sin diacríticos, apóstrofos/comillas/guiones unificados, minúsculas y espacios colapsados.
 */
const APOSTROPHES = /[‘’‚‛′`´ʼ]/g;
const QUOTES = /[“”„‟″«»]/g;
const DASHES = /[‐-―−﹘﹣－]/g;
const SPACES = /[\s   -   　]+/g;
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(APOSTROPHES, "'")
    .replace(QUOTES, '"')
    .replace(DASHES, "-")
    .toLowerCase()
    .replace(SPACES, " ")
    .trim();
}

/* ---------- Validación de entrada (estricta: rechaza parámetros desconocidos) ---------- */
/**
 * `?locale=` opcional: acepta un idioma soportado o una etiqueta BCP-47 corta de él ("pt-BR" → "pt").
 * Un idioma no soportado se rechaza (400) en lugar de caer en silencio a otro idioma.
 */
const localeField = z
  .string()
  .trim()
  .max(35)
  .regex(/^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*$/, "Idioma inválido.")
  .transform((s) => s.split(/[-_]/)[0].toLowerCase())
  .refine((s): s is GeoLocale => isLocale(s), "Idioma no soportado.")
  .transform((s) => s as GeoLocale)
  .optional();
const countryCode = z.string().trim().regex(/^[A-Za-z]{2}$/, "Código de país inválido (ISO 3166-1 alfa-2).").transform((s) => s.toUpperCase());

export const countriesQuerySchema = z.object({ locale: localeField }).strict();
export const countryParamsSchema = z.object({ code: countryCode }).strict();
export const levelsQuerySchema = z.object({ locale: localeField }).strict();
export const areasQuerySchema = z
  .object({
    country: countryCode,
    parentId: z.string().uuid().optional(),
    q: z
      .string()
      .trim()
      .min(2, "Escribe al menos 2 caracteres.")
      .max(80)
      // Sin comodines de LIKE ni caracteres de control: la búsqueda es por texto literal.
      .regex(/^[^%_\\\p{Cc}]+$/u, "La búsqueda contiene caracteres no permitidos.")
      // La búsqueda usa la forma normalizada: "´´" o solo marcas combinantes no deben convertirse en "todo".
      .refine((s) => normalizeName(s).length >= 2, "Escribe al menos 2 caracteres.")
      .optional(),
    limit: z.coerce.number().int().min(1).max(AREAS_MAX_LIMIT).default(AREAS_DEFAULT_LIMIT),
    locale: localeField,
  })
  .strict();
export const areaParamsSchema = z.object({ id: z.string().uuid() }).strict();
export const areaQuerySchema = z.object({ locale: localeField }).strict();

/* ---------- hasChildren ---------- */
/** Marca hasChildren a partir de un groupBy por parentId (una sola consulta para toda la página). */
export function withHasChildren<T extends { id: string }>(rows: T[], groups: { parentId: string | null; _count: { _all: number } }[]) {
  const withKids = new Set(groups.filter((g) => g.parentId && g._count._all > 0).map((g) => g.parentId as string));
  return rows.map((r) => ({ ...r, hasChildren: withKids.has(r.id) }));
}

/* ---------- Breadcrumb ---------- */
export const AREA_PUBLIC_SELECT = { id: true, name: true, kind: true, rank: true, isoCode: true, isActive: true } as const;
export type AreaCrumb = { id: string; name: string; kind: "ADMIN" | "LOCALITY"; rank: number; isoCode: string | null };
export type AncestorNode = AreaCrumb & { isActive?: boolean; parent?: AncestorNode | null };

/**
 * Select anidado de `parent` con profundidad fija (sin recursión ilimitada).
 * Prisma lo resuelve con una cantidad acotada de consultas, independiente de los datos.
 */
export function ancestorSelect(depth: number = BREADCRUMB_MAX_DEPTH): Record<string, unknown> {
  const sel: Record<string, unknown> = { ...AREA_PUBLIC_SELECT };
  if (depth > 0) sel.parent = { select: ancestorSelect(depth - 1) };
  return sel;
}

/**
 * Aplana la cadena node.parent.parent… en una ruta raíz → padre (sin incluir al propio nodo), con tope de profundidad
 * y protección ante ciclos. `truncated` indica que había más ancestros que el tope.
 */
export function buildBreadcrumb(node: { parent?: AncestorNode | null }, maxDepth: number = BREADCRUMB_MAX_DEPTH) {
  const out: AreaCrumb[] = [];
  const seen = new Set<string>();
  let cur = node.parent ?? null;
  let truncated = false;
  while (cur) {
    if (out.length >= maxDepth || seen.has(cur.id)) { truncated = true; break; }
    seen.add(cur.id);
    out.push({ id: cur.id, name: cur.name, kind: cur.kind, rank: cur.rank, isoCode: cur.isoCode ?? null });
    cur = cur.parent ?? null;
  }
  return { path: out.reverse(), truncated };
}

/** Orden estable de países por nombre localizado y luego por código. */
export function sortByLabel<T extends { name: string; code: string }>(rows: T[], locale: GeoLocale) {
  const coll = new Intl.Collator(locale, { sensitivity: "base" });
  return [...rows].sort((a, b) => coll.compare(a.name, b.name) || a.code.localeCompare(b.code));
}
