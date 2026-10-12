import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { cfg } from "../config";
import { AppError, notFound } from "./errors";

const root = path.resolve(cfg.UPLOAD_DIR);
const KEY = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

/** Detecta el tipo real por los primeros bytes (no se confía en la extensión ni en el tipo que declara el cliente). */
export function sniff(b: Buffer): { ext: "jpg" | "png" | "webp" | "pdf"; mime: string } | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (b.length > 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return { ext: "pdf", mime: "application/pdf" };
  return null;
}

/**
 * Valida el comprobante y prepara su registro: nombre aleatorio, tipo real, tamaño y huella. El archivo se guarda en la
 * base (PaymentProof.data), no en el disco del servidor: en Render y en Cloud Run el disco se pierde en cada despliegue.
 */
export function prepareProof(buf: Buffer) {
  const kind = sniff(buf);
  if (!kind) throw new AppError(400, "INVALID_FILE", "Sube una foto (JPG, PNG o WEBP) o un PDF.");
  return { key: `${randomUUID()}.${kind.ext}`, mime: kind.mime, size: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

/** Archivo del comprobante: desde la base; los anteriores a la columna `data`, desde UPLOAD_DIR si todavía existen. */
export async function openProof(proof: { storageKey: string; data: Uint8Array | null }) {
  if (proof.data) return Buffer.from(proof.data);
  if (!KEY.test(proof.storageKey)) throw notFound("Archivo no encontrado.");
  const file = path.join(root, proof.storageKey);
  try { await stat(file); } catch { throw notFound("El archivo ya no está disponible."); }
  return createReadStream(file);
}
