/** Reporte del dry-run (JSON completo + resumen Markdown). No escribe en ninguna base de datos. */
import type { Catalog } from "../build/catalog";
import type { Finding } from "../core/model";

const BY_SECTION: Record<string, (f: Finding) => boolean> = {
  DUPLICATES: (f) => /DUPLICATE|HOMONYM/.test(f.code),
  "INVALID PARENTS": (f) => /^AREA_(PARENT|ROOT|CYCLE|ADMIN_UNDER)/.test(f.code) || f.code === "GEOREF_PARENT_NAME_MISMATCH",
  "INVALID ISO CODES": (f) => /^AREA_ISO|^COUNTRY_(ISO|NUMERIC)/.test(f.code),
  "INVALID COORDINATES": (f) => f.code === "AREA_COORDINATES_INVALID",
};

export function buildReportJson(cat: Catalog) {
  const errors = cat.findings.filter((f) => f.severity === "ERROR");
  const warnings = cat.findings.filter((f) => f.severity === "WARNING");
  const count = <T>(arr: T[], pred: (x: T) => boolean) => arr.filter(pred).length;
  const prio = cat.countries.filter((c) => c.isPriority);

  const countries = {
    total: cat.countries.length,
    insertCandidates: count(cat.countries, (c) => c.disposition !== "REJECTED"),
    updateCandidates: 0,
    rejected: count(cat.countries, (c) => c.disposition === "REJECTED"),
    reviewRequired: count(cat.countries, (c) => c.disposition === "REVIEW_REQUIRED"),
    priority: prio.length,
    verified: count(cat.countries, (c) => c.reviewStatus === "VERIFIED"),
    pendingProfileComplete: count(prio, (c) => c.disposition === "OK" && !!c.currencyCode && !!c.phonePrefix && c.timezones.length > 0 && c.reviewStatus !== "VERIFIED"),
  };
  const levels = {
    total: cat.levels.length, insertCandidates: cat.levels.length, updateCandidates: 0,
    provisional: count(cat.levels, (l) => l.status === "PROVISIONAL"), pending: count(cat.levels, (l) => l.reviewStatus === "PENDING"),
    byCountry: Object.fromEntries([...new Set(cat.levels.map((l) => l.countryCode))].map((cc) => [cc, cat.levels.filter((l) => l.countryCode === cc).map((l) => `${l.rank}:${l.kind}:${l.labels.es}`)])),
    contrast: { match: count(cat.levelContrasts, (c) => c.status === "MATCH"), mismatch: count(cat.levelContrasts, (c) => c.status === "MISMATCH"), pendingSource: count(cat.levelContrasts, (c) => c.status === "PENDING_SOURCE") },
  };
  const areaByLevel: Record<string, number> = {};
  for (const a of cat.areas) areaByLevel[`${a.countryCode} · rango ${a.rank} · ${a.kind}`] = (areaByLevel[`${a.countryCode} · rango ${a.rank} · ${a.kind}`] ?? 0) + 1;
  const excludedBy: Record<string, number> = {};
  for (const e of cat.excluded) excludedBy[`${e.disposition} · ${e.reason.split(":")[0]}`] = (excludedBy[`${e.disposition} · ${e.reason.split(":")[0]}`] ?? 0) + 1;
  const areas = {
    candidates: cat.areas.length,
    insertCandidates: count(cat.areas, (a) => a.disposition === "OK"),
    updateCandidates: 0,
    rejected: count(cat.excluded, (e) => e.disposition === "REJECTED"),
    reviewRequired: count(cat.excluded, (e) => e.disposition === "REVIEW_REQUIRED"),
    excludedByRule: count(cat.excluded, (e) => e.disposition === "EXCLUDED"),
    byCountryAndLevel: areaByLevel,
    excludedBreakdown: excludedBy,
  };
  const sections = Object.fromEntries(Object.entries(BY_SECTION).map(([k, pred]) => [k, cat.findings.filter(pred)]));
  const currencyConflicts = prio.filter((c) => c.evidence.currency && !c.currencyCode).map((c) => ({ code: c.code, ...c.evidence.currency }));
  const phone = prio.map((c) => ({ code: c.code, prefix: c.phonePrefix, ...c.evidence.phone }));
  const phoneConflicts = phone.filter((p) => p.note || p.sharedWith || p.value !== p.prefix || p.prefix === null);
  const reviewItems = [
    ...cat.countries.filter((c) => c.disposition !== "OK").map((c) => ({ type: "Country", ref: c.code, disposition: c.disposition, reasons: c.notes })),
    ...cat.excluded.filter((e) => e.disposition !== "EXCLUDED").map((e) => ({ type: "AdministrativeArea", ref: `${e.source}|${e.sourceId}`, disposition: e.disposition, reasons: [e.reason] })),
  ];
  const status = errors.length ? "FAILED" : "PASSED";

  const json = {
    mode: "DRY-RUN (sin base de datos)", status, generatedAt: new Date().toISOString(),
    baseline: "Catálogo vacío: el modo seguro no consulta la BD. Tras G1-schema las 5 tablas nuevas tienen 0 filas (verificado al desplegar), por eso todo candidato es inserción y no hay actualizaciones.",
    meta: cat.meta, summary: { countries, levels, areas, errors: errors.length, warnings: warnings.length, reviewRequired: reviewItems.length },
    sections: { ...sections, "CURRENCY CONFLICTS": currencyConflicts, "PHONE PREFIX CONFLICTS": phoneConflicts },
    priorityProfiles: prio.map((c) => ({ code: c.code, names: c.names, currencyCode: c.currencyCode, phonePrefix: c.phonePrefix, timezones: c.timezones, reviewStatus: c.reviewStatus, disposition: c.disposition, notes: c.notes, evidence: c.evidence })),
    levels: cat.levels, levelContrasts: cat.levelContrasts, reviewItems, errors, warnings,
    excluded10DigitEntities: cat.excluded.filter((e) => e.disposition === "EXCLUDED").map((e) => ({ sourceId: e.sourceId, name: e.name, ...e.sourceExtra })),
  };
  return json;
}

export type ReportJson = ReturnType<typeof buildReportJson>;

export function buildReport(cat: Catalog): { json: ReportJson; markdown: string } {
  const json = buildReportJson(cat);
  return { json, markdown: toMarkdown(json) };
}

function toMarkdown(r: ReportJson): string {
  const s = r.summary;
  const L: string[] = [];
  L.push(`# Dry-run G1-data — ${r.status}`, "", `Modo: ${r.mode} · Generado: ${r.generatedAt}`, "", `> ${r.baseline}`, "");
  L.push("## COUNTRIES", `- total: ${s.countries.total} (prioritarios: ${s.countries.priority})`, `- insert candidates: ${s.countries.insertCandidates}`, `- update candidates: ${s.countries.updateCandidates}`, `- rejected: ${s.countries.rejected}`, `- review required: ${s.countries.reviewRequired}`, `- VERIFIED: ${s.countries.verified} · prioritarios con perfil completo pendientes solo de contraste UIT: ${s.countries.pendingProfileComplete}`, "");
  L.push("## LEVELS", `- total: ${s.levels.total} · insert candidates: ${s.levels.insertCandidates} · update candidates: ${s.levels.updateCandidates} · provisionales: ${s.levels.provisional} · PENDING: ${s.levels.pending}`,
    `- contraste con fuente: MATCH ${s.levels.contrast.match} · MISMATCH ${s.levels.contrast.mismatch} · PENDING_SOURCE ${s.levels.contrast.pendingSource}`, "",
    "| País | Rango | Fuente | Esperado | Observado | Estado | Detalle |", "|---|---|---|---|---|---|---|");
  for (const c of r.levelContrasts) L.push(`| ${c.countryCode} | ${c.rank} | ${c.source} | ${c.expected ?? "—"} | ${c.observed ?? "—"} | ${c.status} | ${c.detail} |`);
  L.push("");
  L.push("## AREAS", `- candidatas: ${s.areas.candidates} · insert candidates: ${s.areas.insertCandidates} · update candidates: ${s.areas.updateCandidates}`, `- rejected: ${s.areas.rejected} · review required: ${s.areas.reviewRequired} · excluidas por regla: ${s.areas.excludedByRule}`);
  for (const [k, v] of Object.entries(s.areas.byCountryAndLevel)) L.push(`  - ${k}: ${v}`);
  for (const [k, v] of Object.entries(s.areas.excludedBreakdown)) L.push(`  - ${k}: ${v}`);
  L.push("");
  for (const [k, v] of Object.entries(r.sections)) {
    const arr = v as unknown[];
    L.push(`## ${k}: ${arr.length}`);
    for (const x of arr.slice(0, 30)) L.push(`- ${JSON.stringify(x)}`);
    if (arr.length > 30) L.push(`- … (${arr.length - 30} más en el JSON)`);
    L.push("");
  }
  L.push("## PERFILES PRIORITARIOS", "", "| País | Moneda | Prefijo | Zonas | reviewStatus | Disposición |", "|---|---|---|---|---|---|");
  for (const p of r.priorityProfiles) L.push(`| ${p.code} ${p.names.es} | ${p.currencyCode ?? "—"} | ${p.phonePrefix ?? "—"} | ${p.timezones.length} | ${p.reviewStatus} | ${p.disposition} |`);
  L.push("", `## ERRORES: ${s.errors} · WARNINGS: ${s.warnings} · REVIEW REQUIRED: ${s.reviewRequired}`);
  for (const e of r.errors.slice(0, 50)) L.push(`- ERROR ${e.code} ${e.ref ?? ""}: ${e.message}`);
  return L.join("\n") + "\n";
}
