// Prisma de apps/api contra la base local (run.sh / run-pg.sh fijan DATABASE_URL).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// 5441 = PGlite en memoria (run.sh); 5442 = PostgreSQL desechable en Docker (run-pg.sh). Nada más.
if (!/@127\.0\.0\.1:(5441|5442|5444)\//.test(process.env.DATABASE_URL ?? "")) throw new Error("DATABASE_URL no es local");
const require = createRequire(path.join(here, "..", "apps", "api", "package.json"));
const { PrismaClient } = require("@prisma/client");
export const prisma = new PrismaClient();
