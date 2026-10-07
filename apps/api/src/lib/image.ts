import { createHash } from "node:crypto";
import { AppError } from "./errors";
import { sniff } from "./storage";

export interface ImageInfo { mime: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number; size: number; sha256: string }

/** Dimensiones reales leyendo la cabecera (PNG IHDR, JPEG SOFn, WEBP VP8/VP8L/VP8X). null si no se pueden leer. */
export function imageSize(b: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === "image/png") return b.length >= 24 ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null;
    if (mime === "image/jpeg") {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC).
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        i += 2 + b.readUInt16BE(i + 2);
      }
      return null;
    }
    if (mime === "image/webp") {
      const chunk = b.subarray(12, 16).toString("latin1");
      if (chunk === "VP8 " && b.length >= 30) return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L" && b.length >= 25) {
        const bits = b.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8X" && b.length >= 30) return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    }
  } catch { /* cabecera truncada */ }
  return null;
}

/**
 * Valida una imagen subida: tipo real (no la extensión), peso, dimensiones y proporción. Mensajes en español con la
 * medida exacta esperada, para que la parroquia pueda corregir el archivo.
 */
export function validateImage(buf: Buffer, rule: {
  label: string; mimes: readonly string[]; maxBytes: number;
  minWidth: number; minHeight: number; maxPx: number; minRatio: number; maxRatio: number;
}): ImageInfo {
  const kind = sniff(buf);
  if (!kind || !rule.mimes.includes(kind.mime)) {
    throw new AppError(400, "INVALID_IMAGE_TYPE", `${rule.label}: usa una imagen ${rule.mimes.map((m) => m.replace("image/", "").toUpperCase()).join(", ")}.`);
  }
  if (buf.length > rule.maxBytes) {
    throw new AppError(400, "IMAGE_TOO_LARGE", `${rule.label}: pesa ${(buf.length / 1048576).toFixed(1)} MB; el máximo es ${(rule.maxBytes / 1048576).toFixed(0)} MB.`);
  }
  const dim = imageSize(buf, kind.mime);
  if (!dim || !dim.width || !dim.height) throw new AppError(400, "INVALID_IMAGE", `${rule.label}: no se pudo leer la imagen. Exporta el archivo de nuevo.`);
  if (dim.width < rule.minWidth || dim.height < rule.minHeight) {
    throw new AppError(400, "IMAGE_TOO_SMALL", `${rule.label}: mide ${dim.width} × ${dim.height} px; el mínimo es ${rule.minWidth} × ${rule.minHeight} px.`);
  }
  if (dim.width > rule.maxPx || dim.height > rule.maxPx) {
    throw new AppError(400, "IMAGE_TOO_BIG", `${rule.label}: mide ${dim.width} × ${dim.height} px; el máximo es ${rule.maxPx} px por lado.`);
  }
  const ratio = dim.width / dim.height;
  if (ratio < rule.minRatio || ratio > rule.maxRatio) {
    throw new AppError(400, "IMAGE_BAD_RATIO", `${rule.label}: la proporción ${dim.width} × ${dim.height} no corresponde (se espera entre ${rule.minRatio.toFixed(2)} y ${rule.maxRatio.toFixed(2)} de ancho por alto).`);
  }
  return { mime: kind.mime as ImageInfo["mime"], width: dim.width, height: dim.height, size: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

/** Lee el primer archivo de un multipart (el límite global es 10 MB; cada regla aplica el suyo). */
export async function readSingleFile(req: { file: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined> }): Promise<Buffer> {
  const part = await req.file();
  if (!part) throw new AppError(400, "NO_FILE", "Adjunta la imagen.");
  const buf = await part.toBuffer();
  if (!buf.length) throw new AppError(400, "NO_FILE", "Adjunta la imagen.");
  return buf;
}
