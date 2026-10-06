/**
 * Adaptador: Georef AR (provincias, departamentos, localidades).
 * Reglas (aprobadas para esta fase):
 *  - Padres SOLO por relaciones explícitas del archivo (provincia.id, departamento.id). Nunca por nombre ni prefijo.
 *  - Localidades: solo los registros de 8 dígitos (localidades censales). Las "Entidades" de 10 dígitos se
 *    EXCLUYEN (sin cuarto nivel); su localidad_censal se conserva en el reporte.
 *  - CABA no tiene tratamiento especial: AR-C → Comunas (departamentos) → localidades.
 */
import { readVerifiedJson } from "../core/files";
import type { CanonicalArea, ExcludedRecord, Finding } from "../core/model";
import { normalizeName } from "../core/normalize";

export const GEOREF_SOURCE = "GEOREF";
export const COUNTRY = "AR";
const sid = (entity: "provincias" | "departamentos" | "localidades", id: string) => `${entity}:${id}`;

type Centroide = { lat: number | null; lon: number | null } | null | undefined;
export interface GeorefProvincia { id: string; nombre: string; categoria: string; iso_id?: string | null; centroide?: Centroide }
export interface GeorefDepartamento { id: string; nombre: string; categoria: string; provincia?: { id?: string | null; nombre?: string | null } | null; centroide?: Centroide }
export interface GeorefLocalidad {
  id: string; nombre: string; categoria: string;
  provincia?: { id?: string | null; nombre?: string | null } | null;
  departamento?: { id?: string | null; nombre?: string | null } | null;
  gobierno_local?: { id?: string | null; nombre?: string | null } | null;
  localidad_censal?: { id?: string | null; nombre?: string | null } | null;
  centroide?: Centroide;
}
export interface GeorefInput { provincias: GeorefProvincia[]; departamentos: GeorefDepartamento[]; localidades: GeorefLocalidad[] }

export interface GeorefResult { areas: CanonicalArea[]; excluded: ExcludedRecord[]; findings: Finding[]; stats: Record<string, number> }

const coord = (c: Centroide) => ({ latitude: c?.lat ?? null, longitude: c?.lon ?? null });

/** Retención explícita (config/georef-review.json), por sourceId. decision=EXCLUDE: excluido por decisión aprobada; sin decision: REVIEW_REQUIRED. */
export interface GeorefHold { reason: string; decision?: "EXCLUDE"; decisionNote?: string }

export function buildGeorefAreas(input: GeorefInput, reviewHold: Record<string, GeorefHold> = {}): GeorefResult {
  const areas: CanonicalArea[] = [];
  const excluded: ExcludedRecord[] = [];
  const findings: Finding[] = [];
  const stats: Record<string, number> = {};
  const inc = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);

  // Nivel 1: provincias
  const provincias = new Map(input.provincias.map((p) => [p.id, p]));
  for (const p of input.provincias) {
    areas.push({
      countryCode: COUNTRY, rank: 1, kind: "ADMIN", parent: null, isoCode: p.iso_id ?? null,
      source: GEOREF_SOURCE, sourceId: sid("provincias", p.id), name: p.nombre, nameNormalized: normalizeName(p.nombre),
      ...coord(p.centroide), isActive: true, disposition: "OK", sourceExtra: { categoria: p.categoria },
    });
    inc("provincias.ok");
  }

  // Nivel 2: departamentos / partidos / comunas (padre explícito: provincia.id)
  const departamentos = new Map<string, GeorefDepartamento>();
  for (const d of input.departamentos) {
    const pid = d.provincia?.id ?? null;
    if (!pid || !provincias.has(pid)) {
      excluded.push({ source: GEOREF_SOURCE, sourceId: sid("departamentos", d.id), name: d.nombre, disposition: "REJECTED", reason: `provincia.id ausente o inexistente (${pid})` });
      inc("departamentos.rejected");
      continue;
    }
    if (d.provincia?.nombre && d.provincia.nombre !== provincias.get(pid)!.nombre) {
      findings.push({ severity: "WARNING", code: "GEOREF_PARENT_NAME_MISMATCH", message: `El nombre de provincia del departamento (${d.provincia.nombre}) difiere del registro ${pid} (${provincias.get(pid)!.nombre})`, ref: sid("departamentos", d.id) });
    }
    departamentos.set(d.id, d);
    areas.push({
      countryCode: COUNTRY, rank: 2, kind: "ADMIN", parent: { source: GEOREF_SOURCE, sourceId: sid("provincias", pid) }, isoCode: null,
      source: GEOREF_SOURCE, sourceId: sid("departamentos", d.id), name: d.nombre, nameNormalized: normalizeName(d.nombre),
      ...coord(d.centroide), isActive: true, disposition: "OK", sourceExtra: { categoria: d.categoria },
    });
    inc(`departamentos.ok.${d.categoria}`);
  }

  // Nivel 3: localidades (solo 8 dígitos; padre explícito: departamento.id, coherente con provincia.id)
  for (const l of input.localidades) {
    const extra = {
      categoria: l.categoria, localidad_censal: l.localidad_censal?.id ?? null, localidad_censal_nombre: l.localidad_censal?.nombre ?? null,
      gobierno_local: l.gobierno_local?.id ?? null, departamento: l.departamento?.id ?? null, provincia: l.provincia?.id ?? null,
    };
    if (/^[0-9]{10}$/.test(l.id)) {
      excluded.push({ source: GEOREF_SOURCE, sourceId: sid("localidades", l.id), name: l.nombre, disposition: "EXCLUDED", reason: "Entidad de 10 dígitos: excluida en esta fase (sin cuarto nivel)", sourceExtra: extra });
      inc(l.provincia?.id === "02" ? "localidades.excluded10.CABA" : "localidades.excluded10.otras");
      continue;
    }
    if (!/^[0-9]{8}$/.test(l.id)) {
      excluded.push({ source: GEOREF_SOURCE, sourceId: sid("localidades", l.id), name: l.nombre, disposition: "REJECTED", reason: `id con formato no previsto (${l.id.length} caracteres)`, sourceExtra: extra });
      inc("localidades.rejected.format");
      continue;
    }
    const hold = reviewHold[sid("localidades", l.id)];
    if (hold) {
      const exclude = hold.decision === "EXCLUDE";
      excluded.push({
        source: GEOREF_SOURCE, sourceId: sid("localidades", l.id), name: l.nombre, disposition: exclude ? "EXCLUDED" : "REVIEW_REQUIRED",
        reason: exclude ? `Excluido por decisión aprobada: ${hold.decisionNote ?? hold.reason}` : `Retenido para revisión: ${hold.reason}`, sourceExtra: extra,
      });
      inc(`localidades.${exclude ? "excluded.decision" : "review.hold"}.${l.provincia?.id === "02" ? "CABA" : "otras"}`);
      continue;
    }
    const did = l.departamento?.id ?? null;
    const dep = did ? departamentos.get(did) : undefined;
    if (!dep) {
      excluded.push({ source: GEOREF_SOURCE, sourceId: sid("localidades", l.id), name: l.nombre, disposition: "REVIEW_REQUIRED", reason: `departamento.id ausente o no resoluble (${did}): no se asigna padre por inferencia`, sourceExtra: extra });
      inc("localidades.review.parent");
      continue;
    }
    if (dep.provincia?.id !== l.provincia?.id) {
      excluded.push({ source: GEOREF_SOURCE, sourceId: sid("localidades", l.id), name: l.nombre, disposition: "REVIEW_REQUIRED", reason: `provincia.id (${l.provincia?.id}) no coincide con la del departamento ${did} (${dep.provincia?.id})`, sourceExtra: extra });
      inc("localidades.review.provinceMismatch");
      continue;
    }
    areas.push({
      countryCode: COUNTRY, rank: 3, kind: "LOCALITY", parent: { source: GEOREF_SOURCE, sourceId: sid("departamentos", did!) }, isoCode: null,
      source: GEOREF_SOURCE, sourceId: sid("localidades", l.id), name: l.nombre, nameNormalized: normalizeName(l.nombre),
      ...coord(l.centroide), isActive: true, disposition: "OK", sourceExtra: extra,
    });
    inc(l.provincia?.id === "02" ? "localidades.ok8.CABA" : "localidades.ok8.otras");
  }
  return { areas, excluded, findings, stats };
}

type WithItems<K extends string, T> = Record<K, T[]> & { cantidad?: number; total?: number };
export function loadGeorefInput(): GeorefInput {
  const p = readVerifiedJson<WithItems<"provincias", GeorefProvincia>>("S6-georef-provincias");
  const d = readVerifiedJson<WithItems<"departamentos", GeorefDepartamento>>("S6-georef-departamentos");
  const l = readVerifiedJson<WithItems<"localidades", GeorefLocalidad>>("S6-georef-localidades");
  for (const [name, f, arr] of [["provincias", p, p.provincias], ["departamentos", d, d.departamentos], ["localidades", l, l.localidades]] as const) {
    if (f.total !== undefined && f.total !== arr.length) throw new Error(`Georef ${name}: total=${f.total} pero el archivo trae ${arr.length} registros (descarga incompleta)`);
  }
  return { provincias: p.provincias, departamentos: d.departamentos, localidades: l.localidades };
}
