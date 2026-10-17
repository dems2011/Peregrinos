import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { formatLinkCode, LINK_CODE_ALPHABET, normalizeLinkCode } from "@peregrinos/shared";

/**
 * SIGyP — credenciales de integración por organización (docs/INTEGRACION-SIGYP.md). La credencial se genera aquí, se
 * muestra UNA vez y solo se guarda su SHA-256: una copia de la base no permite usarla. Prefijo reconocible para que
 * los detectores de secretos la identifiquen.
 */
export const SIGYP_TOKEN_PREFIX = "pgsig_";
const TOKEN_RE = /^pgsig_[A-Za-z0-9_-]{43}$/;

export function newSigypToken(): { token: string; hash: string; hint: string } {
  const token = SIGYP_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashSigypToken(token), hint: token.slice(-4) };
}

export const hashSigypToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

/** Credencial del encabezado Authorization (Bearer), o null si falta o no tiene el formato esperado. */
export function bearerSigypToken(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m || !TOKEN_RE.test(m[1])) return null;
  return m[1];
}

/** Comparación en tiempo constante de dos hashes hex (defensa adicional a la búsqueda por índice único). */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * Regla de aplicación por versión (contrato v1): se aplica solo una versión MAYOR que la guardada. Igual o menor =
 * «stale» (ya se aplicó o llegó tarde): se responde 200 sin cambiar nada, así reintentar nunca duplica ni retrocede.
 */
export function versionOutcome(stored: number | null | undefined, incoming: number): "applied" | "stale" {
  return stored != null && stored >= incoming ? "stale" : "applied";
}

/* -------- Códigos de vinculación (un solo uso, 15 minutos) -------- */

/** Código nuevo («PGV-XXXXX-XXXXX-XXXXX-XXXXX», ≈100 bits). Solo se guarda el hash del código normalizado. */
export function newLinkCode(): { code: string; hash: string } {
  const bytes = randomBytes(20);
  const body = [...bytes].map((b) => LINK_CODE_ALPHABET[b % LINK_CODE_ALPHABET.length]).join("");
  const code = formatLinkCode(body);
  return { code, hash: hashSigypToken(normalizeLinkCode(code)!) };
}

/** Hash del código tal como lo escribe la persona (con o sin guiones, en minúsculas), o null si no tiene el formato. */
export function hashLinkCode(raw: string): string | null {
  const n = normalizeLinkCode(raw);
  return n ? hashSigypToken(n) : null;
}
