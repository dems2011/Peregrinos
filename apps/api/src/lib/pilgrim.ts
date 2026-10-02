import { createHash, randomBytes, randomInt } from "node:crypto";

// Sin I, L, O, 0, 1 para evitar confusiones al dictar o leer el código.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Token del enlace personal (256 bits). */
export const newAccessToken = () => randomBytes(32).toString("base64url");
/** Código corto de respaldo (10 caracteres, ~50 bits). */
export const newAccessCode = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const formatCode = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;
export const hashAccess = (v: string) => createHash("sha256").update(v).digest("hex");
