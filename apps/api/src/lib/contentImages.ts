import { createHash } from "node:crypto";
import sharp from "sharp";
import type { ContentImageOwner, ContentImageVariant, Prisma } from "@prisma/client";
import { validateImage } from "./image";
import { prisma } from "./prisma";

/**
 * B5 — Imágenes de contenido (portada de evento, imagen de campaña) guardadas en la base, como MediaAsset (Render no
 * tiene disco persistente). Se conserva el ORIGINAL validado (solo para el personal: puede traer metadatos del teléfono)
 * y se generan variantes WebP sin metadatos y sin agrandar: LARGE (escritorio), MEDIUM (tableta), SMALL (móvil).
 * La proporción se respeta siempre (sin recortes ni deformación); la web las muestra con object-fit: cover.
 */
export const VARIANT_WIDTH: Record<Exclude<ContentImageVariant, "ORIGINAL">, number> = { LARGE: 1600, MEDIUM: 960, SMALL: 480 };
export const PUBLIC_VARIANTS = ["LARGE", "MEDIUM", "SMALL"] as const;

export const CONTENT_IMAGE_RULES: Record<ContentImageOwner, Parameters<typeof validateImage>[1]> = {
  EVENT_COVER: { label: "Portada del evento", mimes: ["image/png", "image/jpeg", "image/webp"], maxBytes: 5 * 1024 * 1024, minWidth: 800, minHeight: 400, maxPx: 6000, minRatio: 1.2, maxRatio: 2.5 },
  DONATION_CAMPAIGN: { label: "Imagen de la campaña", mimes: ["image/png", "image/jpeg", "image/webp"], maxBytes: 5 * 1024 * 1024, minWidth: 600, minHeight: 400, maxPx: 6000, minRatio: 0.8, maxRatio: 2.5 },
};

export interface PreparedImage { variant: ContentImageVariant; mime: string; width: number; height: number; sizeBytes: number; sha256: string; data: Buffer }

/** Valida (tipo real, peso, medidas, proporción) y genera las variantes. Lanza AppError 400 con el motivo exacto. */
export async function prepareContentImage(owner: ContentImageOwner, buf: Buffer): Promise<PreparedImage[]> {
  const info = validateImage(buf, CONTENT_IMAGE_RULES[owner]);
  const out: PreparedImage[] = [{ variant: "ORIGINAL", mime: info.mime, width: info.width, height: info.height, sizeBytes: info.size, sha256: info.sha256, data: buf }];
  for (const [variant, width] of Object.entries(VARIANT_WIDTH) as [Exclude<ContentImageVariant, "ORIGINAL">, number][]) {
    // rotate(): aplica la orientación EXIF; toBuffer sin withMetadata(): quita EXIF/GPS del archivo público.
    const { data, info: o } = await sharp(buf, { limitInputPixels: 6000 * 6000 }).rotate()
      .resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    out.push({ variant, mime: "image/webp", width: o.width, height: o.height, sizeBytes: data.length, sha256: createHash("sha256").update(data).digest("hex"), data });
  }
  return out;
}

/** Reemplaza todas las variantes de un dueño (dentro de la transacción de la operación). */
export async function replaceContentImage(tx: Prisma.TransactionClient, input: { organizationId: string; ownerType: ContentImageOwner; ownerId: string; createdById: string; images: PreparedImage[] }) {
  await tx.contentImage.deleteMany({ where: { ownerType: input.ownerType, ownerId: input.ownerId } });
  await tx.contentImage.createMany({
    data: input.images.map((i) => ({
      organizationId: input.organizationId, ownerType: input.ownerType, ownerId: input.ownerId, variant: i.variant, mime: i.mime,
      width: i.width, height: i.height, sizeBytes: i.sizeBytes, sha256: i.sha256, data: new Uint8Array(i.data), createdById: input.createdById,
    })),
  });
}

/** URLs públicas de las variantes (con versión para que el navegador no muestre una vieja). null si no hay imagen. */
export async function contentImageUrls(ownerType: ContentImageOwner, ownerId: string) {
  const rows = await prisma.contentImage.findMany({ where: { ownerType, ownerId, variant: { in: [...PUBLIC_VARIANTS] } }, select: { variant: true, sha256: true, width: true } });
  if (!rows.length) return null;
  const seg = ownerType === "EVENT_COVER" ? "events" : "campaigns";
  const url = (v: string) => { const r = rows.find((x) => x.variant === v); return r ? `/api/public/${seg}/${ownerId}/image/${v.toLowerCase()}?v=${r.sha256.slice(0, 12)}` : null; };
  return { large: url("LARGE"), medium: url("MEDIUM"), small: url("SMALL") };
}

/** Varias a la vez (listas de eventos o campañas) en una sola consulta. */
export async function contentImageUrlsFor(ownerType: ContentImageOwner, ownerIds: string[]) {
  if (!ownerIds.length) return new Map<string, { large: string | null; medium: string | null; small: string | null }>();
  const rows = await prisma.contentImage.findMany({ where: { ownerType, ownerId: { in: ownerIds }, variant: { in: [...PUBLIC_VARIANTS] } }, select: { ownerId: true, variant: true, sha256: true } });
  const seg = ownerType === "EVENT_COVER" ? "events" : "campaigns";
  const map = new Map<string, { large: string | null; medium: string | null; small: string | null }>();
  for (const id of ownerIds) {
    const mine = rows.filter((r) => r.ownerId === id);
    if (!mine.length) continue;
    const url = (v: string) => { const r = mine.find((x) => x.variant === v); return r ? `/api/public/${seg}/${id}/image/${v.toLowerCase()}?v=${r.sha256.slice(0, 12)}` : null; };
    map.set(id, { large: url("LARGE"), medium: url("MEDIUM"), small: url("SMALL") });
  }
  return map;
}
