import { randomInt } from "node:crypto";
import { sha256 } from "./tokens";

/** Alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L): fácil de dictar y de copiar. */
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const block = () => Array.from({ length: 4 }, () => ALPHA[randomInt(ALPHA.length)]).join("");

/** Código de seguimiento «CERT-XXXX-XXXX» (≈ 8,5·10¹¹ combinaciones; aleatorio criptográfico, no adivinable). */
export const newTrackingCode = () => `CERT-${block()}-${block()}`;

/**
 * Clave de consulta del solicitante: hash del código + correo. Sin ambos no se ve nada, y la respuesta es la misma si
 * falla cualquiera de los dos (no revela si un código existe).
 */
export const certificateAccessHash = (code: string, email: string) => sha256(`${code.trim().toUpperCase()}:${email.trim().toLowerCase()}`);
