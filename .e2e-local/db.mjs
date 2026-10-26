// Prisma de apps/api contra la base local (run.sh fija DATABASE_URL en 127.0.0.1:5441).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
if (!/127\.0\.0\.1:5441/.test(process.env.DATABASE_URL ?? "")) throw new Error("DATABASE_URL no es local");
const require = createRequire(path.join(here, "..", "apps", "api", "package.json"));
const { PrismaClient } = require("@prisma/client");
export const prisma = new PrismaClient();
