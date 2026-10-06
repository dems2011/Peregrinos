/**
 * geo:dry-run — construye y valida el catálogo canónico SOLO desde archivos locales verificados.
 * GARANTÍAS DE MODO SEGURO:
 *  - No importa @prisma/client ni src/lib/prisma ni src/config (un test lo verifica estáticamente).
 *  - No lee DATABASE_URL ni carga .env; funciona con Neon apagado o inaccesible.
 *  - Su única escritura es el reporte en apps/api/geo/reports/.
 */
import fs from "node:fs";
import path from "node:path";
import { buildCatalog } from "../build/catalog";
import { GEO_DIR } from "../core/files";
import { buildReport } from "../report/report";

const catalog = buildCatalog();
const { json, markdown } = buildReport(catalog);
const dir = path.join(GEO_DIR, "reports");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "dry-run-latest.json"), JSON.stringify(json, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "dry-run-latest.md"), markdown);

const s = json.summary;
console.log(`DRY-RUN ${json.status} (sin base de datos)`);
console.log(`COUNTRIES  total ${s.countries.total} · insert ${s.countries.insertCandidates} · update ${s.countries.updateCandidates} · rejected ${s.countries.rejected} · review ${s.countries.reviewRequired} · verified ${s.countries.verified}`);
console.log(`LEVELS     total ${s.levels.total} · PENDING ${s.levels.pending} · contraste MATCH ${s.levels.contrast.match} · MISMATCH ${s.levels.contrast.mismatch} · PENDING_SOURCE ${s.levels.contrast.pendingSource}`);
console.log(`AREAS      insert ${s.areas.insertCandidates} · rejected ${s.areas.rejected} · review ${s.areas.reviewRequired} · excluidas ${s.areas.excludedByRule}`);
for (const [k, v] of Object.entries(json.sections)) console.log(`${k.padEnd(24)} ${(v as unknown[]).length}`);
console.log(`ERRORES ${s.errors} · WARNINGS ${s.warnings}`);
console.log(`Reporte: ${path.relative(process.cwd(), path.join(dir, "dry-run-latest.md"))}`);
process.exitCode = json.status === "PASSED" ? 0 : 1;
