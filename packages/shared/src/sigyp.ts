import { z } from "zod";

/**
 * Integración con SIGyP — Gestión Parroquial (contrato v1, ver docs/INTEGRACION-SIGYP.md). SIGyP es la fuente de verdad
 * de la cartelera y de los campos públicos del perfil que publica; Peregrinos los recibe por un canal autenticado con
 * una credencial POR ORGANIZACIÓN (la organización sale de la credencial, nunca del contenido). Cada elemento trae una
 * versión creciente: una versión no mayor que la guardada se ignora (reintentar nunca duplica ni retrocede).
 */
export const SIGYP_CONTRACT_VERSION = 1;
export const SIGYP_SCOPES = ["announcements:write", "profile:write"] as const;
export type SigypScope = (typeof SIGYP_SCOPES)[number];

export const SIGYP_CATEGORIES = ["GENERAL", "LITURGIA", "SACRAMENTOS", "CATEQUESIS", "CARIDAD", "ACTIVIDADES", "SECRETARIA"] as const;
export const SIGYP_CATEGORY_LABEL: Record<(typeof SIGYP_CATEGORIES)[number], string> = {
  GENERAL: "General", LITURGIA: "Liturgia y celebraciones", SACRAMENTOS: "Sacramentos", CATEQUESIS: "Catequesis",
  CARIDAD: "Caridad y servicio", ACTIVIDADES: "Actividades", SECRETARIA: "Secretaría parroquial",
};

const iso = z.string().datetime({ offset: true });

export const sigypAnnouncementSchema = z.object({
  contract: z.literal(1),
  sourceId: z.string().uuid(),
  version: z.number().int().min(1).max(1_000_000),
  title: z.string().trim().min(3).max(150),
  body: z.string().trim().min(3).max(5000),
  category: z.enum(SIGYP_CATEGORIES),
  startsAt: iso,
  endsAt: iso.nullable(),
  publishedAt: iso,
}).strict().refine((a) => a.endsAt === null || new Date(a.endsAt).getTime() > new Date(a.startsAt).getTime(), {
  message: "endsAt debe ser posterior a startsAt", path: ["endsAt"],
});

export const sigypWithdrawSchema = z.object({
  contract: z.literal(1),
  sourceId: z.string().uuid(),
  version: z.number().int().min(1).max(1_000_000),
}).strict();

/** Los nueve campos públicos que SIGyP administra (siempre presentes; null = vacío). Mismos límites que el perfil. */
export const SIGYP_PROFILE_FIELDS = ["description", "address", "phone", "email", "website", "instagram", "facebook", "youtube", "officeHours"] as const;
const opt = (max: number) => z.string().trim().max(max).nullable();
export const sigypProfileSchema = z.object({
  contract: z.literal(1),
  version: z.number().int().min(1).max(1_000_000),
  profile: z.object({
    description: opt(2000),
    address: opt(240),
    phone: opt(40),
    email: z.string().trim().toLowerCase().email().max(200).nullable(),
    website: z.string().trim().url().max(300).refine((u) => u.startsWith("https://"), "Debe ser https").nullable(),
    instagram: opt(200),
    facebook: opt(200),
    youtube: opt(200),
    officeHours: opt(1000),
  }).strict(),
}).strict();

export type SigypAnnouncement = z.infer<typeof sigypAnnouncementSchema>;
export type SigypProfile = z.infer<typeof sigypProfileSchema>;

/** ¿Se muestra al público ahora? No retirado, ya comenzó y no venció (endsAt exclusivo; sin endsAt no vence). */
export function isAnnouncementVisible(a: { withdrawnAt: Date | string | null; startsAt: Date | string; endsAt: Date | string | null }, now: Date = new Date()): boolean {
  if (a.withdrawnAt) return false;
  const t = now.getTime();
  if (new Date(a.startsAt).getTime() > t) return false;
  return a.endsAt === null || new Date(a.endsAt).getTime() > t;
}

/** Campos del perfil que dejan de editarse en Peregrinos mientras la organización recibe el perfil desde SIGyP. */
export function sigypManagedFieldsIn(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter((k) => (SIGYP_PROFILE_FIELDS as readonly string[]).includes(k));
}
