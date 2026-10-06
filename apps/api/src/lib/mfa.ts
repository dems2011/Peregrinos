import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { cfg } from "../config";
import { formatCode, newAccessCode, normalizeCode } from "./pilgrim";

/**
 * A6 — MFA del personal (ARQUITECTURA-CUENTAS §8). TOTP RFC 6238 (SHA-1, 6 dígitos, 30 s) sin dependencias externas.
 *  - El secreto se guarda cifrado (AES-256-GCM). Clave: MFA_ENCRYPTION_KEY (base64 de 32 bytes) o, si no está
 *    configurada, derivada de JWT_SECRET con HKDF (cambiar JWT_SECRET obligaría a reenrolar).
 *  - Ventana de ±1 paso para tolerar relojes desfasados; cada paso se acepta una sola vez (anti-replay).
 *  - Códigos de recuperación de un solo uso: solo se guarda su hash.
 */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_S = 30;
export const TOTP_WINDOW = 1;
/** Ventana de reautenticación (step-up) para acciones sensibles. */
export const STEP_UP_MINUTES = 10;
/** Vigencia del desafío entre la contraseña y el código en el login. */
export const MFA_CHALLENGE_MINUTES = 5;
export const RECOVERY_CODES_COUNT = 10;
/** Vigencia del enrolamiento sin confirmar. */
export const MFA_PENDING_MINUTES = 15;
/** Fallos consecutivos de segundo factor antes del bloqueo temporal de la cuenta (además del límite por IP). */
export const MFA_MAX_FAILURES = 5;
export const MFA_LOCK_MINUTES = 15;
export const MFA_ISSUER = "Peregrinos";

/* ---------- Base32 (RFC 4648, sin relleno) ---------- */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("base32 inválido");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/* ---------- TOTP ---------- */
export const newTotpSecret = () => base32Encode(randomBytes(20));
export const totpStep = (atMs = Date.now()) => Math.floor(atMs / 1000 / TOTP_PERIOD_S);

/** HOTP (RFC 4226) para un contador. */
export function hotp(secretB32: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * Verifica un código TOTP. Devuelve el paso aceptado (para anti-replay) o null.
 * `lastStep`: último paso ya usado por la cuenta; no se acepta ese ni anteriores.
 */
export function verifyTotp(secretB32: string, code: string, opts: { atMs?: number; lastStep?: number | null } = {}): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const now = totpStep(opts.atMs);
  for (let d = -TOTP_WINDOW; d <= TOTP_WINDOW; d++) {
    const step = now + d;
    if (opts.lastStep != null && step <= opts.lastStep) continue;
    const expected = Buffer.from(hotp(secretB32, step));
    if (timingSafeEqual(expected, Buffer.from(c))) return step;
  }
  return null;
}

/** URI para la app autenticadora (se muestra como QR). */
export function otpauthUrl(secretB32: string, account: string): string {
  const label = encodeURIComponent(`${MFA_ISSUER}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(MFA_ISSUER)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_S}`;
}

/* ---------- Cifrado del secreto en reposo ---------- */
let cachedKey: Buffer | null = null;
function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  // config.ts ya rechaza una MFA_ENCRYPTION_KEY que no sea de 32 bytes: nunca se cae en silencio a la derivada.
  cachedKey = cfg.MFA_ENCRYPTION_KEY
    ? Buffer.from(cfg.MFA_ENCRYPTION_KEY, "base64")
    : Buffer.from(hkdfSync("sha256", cfg.JWT_SECRET, "peregrinos", "mfa-totp-secret-v1", 32));
  return cachedKey;
}
/** Subclave independiente por uso (cifrado vs. HMAC de códigos de recuperación). */
const subKey = (info: string) => Buffer.from(hkdfSync("sha256", masterKey(), "peregrinos-mfa", info, 32));

/**
 * "v1.<iv>.<tag>.<cifrado>" en base64url. `owner` (id de la cuenta) va como AAD: un secreto copiado a otra fila
 * no descifra (impide intercambiar secretos entre cuentas con acceso de escritura a la BD).
 */
export function encryptSecret(plain: string, owner: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  c.setAAD(Buffer.from(`mfa:${owner}`, "utf8"));
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}
export function decryptSecret(stored: string, owner: string): string {
  const [v, iv, tag, enc, extra] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !enc || extra !== undefined) throw new Error("Secreto MFA con formato desconocido.");
  const ivBuf = Buffer.from(iv, "base64url");
  const tagBuf = Buffer.from(tag, "base64url");
  if (ivBuf.length !== 12 || tagBuf.length !== 16) throw new Error("Secreto MFA con formato desconocido.");
  const d = createDecipheriv("aes-256-gcm", masterKey(), ivBuf, { authTagLength: 16 });
  d.setAAD(Buffer.from(`mfa:${owner}`, "utf8"));
  d.setAuthTag(tagBuf);
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

/* ---------- Códigos de recuperación ---------- */
/**
 * HMAC-SHA256 con clave del servidor (no SHA-256 simple): ~50 bits por código no resisten fuerza bruta offline si se
 * filtra la tabla; con la clave fuera de la BD, sí. Incluye la cuenta: el mismo código no sirve en otra.
 */
export const recoveryCodeHash = (userId: string, input: string) =>
  createHmac("sha256", subKey("mfa-recovery-code-v1")).update(`${userId}:${normalizeCode(input)}`).digest("hex");

export function newRecoveryCodes(userId: string, n = RECOVERY_CODES_COUNT) {
  return Array.from({ length: n }, () => {
    const code = newAccessCode();
    return { display: formatCode(code), hash: recoveryCodeHash(userId, code) };
  });
}
/** Formato de un código de recuperación (10 caracteres del alfabeto de códigos, con o sin guion). */
export const looksLikeRecoveryCode = (input: string) => normalizeCode(input).length === 10;

/** §8.1: un SUPERADMIN sin MFA activo solo puede enrolarse (desactivable solo para la transición). */
export const mfaEnrollmentRequired = (u: { role: string | null; mfaEnabledAt: Date | null }) =>
  cfg.MFA_ENFORCE_SUPERADMIN && u.role === "SUPERADMIN" && !u.mfaEnabledAt;

/** El paso de una sesión verificada con MFA sigue vigente para acciones sensibles. */
export const isRecentMfa = (mfaAtSec: number | null | undefined, nowMs = Date.now()) =>
  !!mfaAtSec && nowMs - mfaAtSec * 1000 <= STEP_UP_MINUTES * 60_000;
