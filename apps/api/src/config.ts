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
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Variables de entorno inválidas:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const cfg = parsed.data;
