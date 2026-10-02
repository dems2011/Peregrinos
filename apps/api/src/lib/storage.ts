import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
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

/** Guarda el comprobante con un nombre aleatorio, fuera de cualquier carpeta pública y con permisos restringidos. */
export async function saveProof(buf: Buffer) {
  const kind = sniff(buf);
  if (!kind) throw new AppError(400, "INVALID_FILE", "Sube una foto (JPG, PNG o WEBP) o un PDF.");
  const key = `${randomUUID()}.${kind.ext}`;
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(path.join(root, key), buf, { flag: "wx", mode: 0o600 });
  return { key, mime: kind.mime, size: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

export async function openProof(key: string) {
  if (!KEY.test(key)) throw notFound("Archivo no encontrado.");
  const file = path.join(root, key);
  try { await stat(file); } catch { throw notFound("El archivo ya no está disponible."); }
  return createReadStream(file);
}
