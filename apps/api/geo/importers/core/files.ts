/**
 * Acceso a los archivos locales de G1-data. Solo lectura de disco: sin red, sin base de datos.
 * Cada archivo se verifica contra el SHA-256 registrado en manifest.json antes de usarse.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

export const GEO_DIR = path.resolve(__dirname, "..", "..");
export const DOWNLOADS_DIR = path.join(GEO_DIR, ".downloads");
export const CONFIG_DIR = path.join(GEO_DIR, "config");

interface ManifestEntry {
  id: string;
  version?: string;
  url: string;
  sha256: string | null;
  localFile?: string;
  signature?: { sha256: string; localFile: string };
}

export function readJsonFile<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function loadManifest(): { datasets: ManifestEntry[] } {
  return readJsonFile(path.join(GEO_DIR, "manifest.json"));
}

/** Devuelve el contenido del archivo local de un dataset, verificando su SHA-256. Lanza si falta o no coincide. */
export function readVerified(datasetId: string): { buffer: Buffer; entry: ManifestEntry; file: string } {
  const entry = loadManifest().datasets.find((d) => d.id === datasetId);
  if (!entry) throw new Error(`Dataset ${datasetId} no está en manifest.json`);
  if (!entry.sha256 || !entry.localFile) throw new Error(`Dataset ${datasetId} no fue descargado (sin sha256/localFile en el manifiesto)`);
  const file = path.join(DOWNLOADS_DIR, entry.localFile);
  if (!fs.existsSync(file)) throw new Error(`Falta el archivo local ${file}`);
  const buffer = fs.readFileSync(file);
  const sha = crypto.createHash("sha256").update(buffer).digest("hex");
  if (sha !== entry.sha256) throw new Error(`SHA-256 distinto para ${datasetId}: esperado ${entry.sha256}, obtenido ${sha}`);
  return { buffer, entry, file };
}

export const readVerifiedJson = <T>(datasetId: string): T => JSON.parse(readVerified(datasetId).buffer.toString("utf8")) as T;
export const readVerifiedText = (datasetId: string): string => readVerified(datasetId).buffer.toString("utf8");

/** Lector mínimo de tar (ustar) sobre un .tar.gz: devuelve el contenido de los archivos pedidos. */
export function extractFromTarGz(buffer: Buffer, wanted: string[]): Record<string, string> {
  const tar = zlib.gunzipSync(buffer);
  const out: Record<string, string> = {};
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // fin del archivo tar
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/s, "");
    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = parseInt(header.subarray(124, 136).toString("utf8").replace(/\0.*$/s, "").trim() || "0", 8);
    const dataStart = offset + 512;
    if (wanted.includes(fullName)) out[fullName] = tar.subarray(dataStart, dataStart + size).toString("utf8");
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  for (const w of wanted) if (!(w in out)) throw new Error(`El tar no contiene ${w}`);
  return out;
}
