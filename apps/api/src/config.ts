import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  ACCESS_TTL_MIN: z.coerce.number().int().min(1).default(15),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(14),
  INVITE_TTL_DAYS: z.coerce.number().int().min(1).default(7),
  PILGRIM_SESSION_DAYS: z.coerce.number().int().min(1).default(60),
  /** Opcional. Ej: smtp://usuario:clave@smtp.proveedor.com:587 . Sin esto, los enlaces se muestran en la consola. */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("Peregrinos <no-reply@peregrinos.local>"),
  /** Carpeta privada de comprobantes de pago. En producción, un volumen persistente con respaldo. */
  UPLOAD_DIR: z.string().default("./uploads"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  /** A6: clave AES-256 (base64 de 32 bytes) para cifrar los secretos MFA. Opcional: sin ella se deriva de JWT_SECRET. */
  MFA_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine((v) => !v || Buffer.from(v, "base64").length === 32, "MFA_ENCRYPTION_KEY debe ser base64 de 32 bytes"),
  /**
   * A6: con "true", un SUPERADMIN sin MFA solo puede enrolarse (ARQUITECTURA-CUENTAS §8.1).
   * BETA: desactivado por defecto (la arquitectura MFA sigue completa; se reactiva con MFA_ENFORCE_SUPERADMIN=true).
   */
  MFA_ENFORCE_SUPERADMIN: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  /**
   * Verificación del correo de las cuentas de peregrino. "required" (por defecto): no se ingresa sin verificar.
   * "optional": solo para operar sin SMTP (BETA); el primer ingreso con la contraseña correcta marca el correo como
   * verificado. Nunca se habilita por sí solo.
   */
  PILGRIM_EMAIL_VERIFICATION: z.enum(["required", "optional"]).default("required"),
  /** Informe del evento con IA (opcional). Sin clave, la API responde que el servicio no está configurado. */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  /**
   * Notificaciones push (FCM, opcional): JSON de la cuenta de servicio de Firebase codificado en base64.
   * Sin esta variable no se envían push (los avisos siguen llegando a la bandeja de la app).
   */
  FIREBASE_SERVICE_ACCOUNT: z
    .string()
    .optional()
    .refine((v) => !v || parseServiceAccount(v) !== null, "FIREBASE_SERVICE_ACCOUNT debe ser el JSON de la cuenta de servicio en base64"),
});

/** Decodifica la cuenta de servicio (base64 → JSON). null si no es válida; nunca incluye el valor en errores. */
export function parseServiceAccount(b64: string): { projectId: string; clientEmail: string; privateKey: string } | null {
  try {
    const j = JSON.parse(Buffer.from(b64.trim(), "base64").toString("utf8")) as Record<string, unknown>;
    const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = j;
    if (typeof projectId !== "string" || typeof clientEmail !== "string" || typeof privateKey !== "string" || !privateKey.includes("PRIVATE KEY")) return null;
    return { projectId, clientEmail, privateKey };
  } catch {
    return null;
  }
}

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Variables de entorno inválidas:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const cfg = parsed.data;
