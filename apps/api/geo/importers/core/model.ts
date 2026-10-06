/**
 * Modelo canónico intermedio del catálogo geográfico (G1-data).
 * Es independiente de las fuentes y de Prisma: los adaptadores producen esto, el validador lo revisa
 * y el reporte lo resume. Nada de este módulo escribe en la base de datos.
 */

export const PRODUCT_LOCALES = ["es", "en", "pt", "it"] as const;
export type ProductLocale = (typeof PRODUCT_LOCALES)[number];
export type LocalizedText = Record<ProductLocale, string>;

export type AreaKind = "ADMIN" | "LOCALITY";
export type ReviewStatus = "PENDING" | "VERIFIED";

/** Resultado de revisión de cada candidato (no es una columna de la BD). */
export type Disposition = "OK" | "REVIEW_REQUIRED" | "REJECTED";

export interface Finding {
  severity: "ERROR" | "WARNING" | "INFO";
  code: string;
  message: string;
  ref?: string;
}

export interface CanonicalCountry {
  code: string;
  iso3: string | null;
  /** Solo para validar consistencia ISO; no existe columna en el esquema G1. */
  isoNumeric: string | null;
  names: LocalizedText;
  locales: ProductLocale[];
  currencyCode: string | null;
  phonePrefix: string | null;
  timezones: string[];
  reviewStatus: ReviewStatus;
  isPriority: boolean;
  disposition: Disposition;
  /** Evidencia y motivos (va al reporte, no a la BD). */
  notes: string[];
  evidence: {
    currency?: { iso4217: string[]; iso4217Funds: string[]; cldrCurrent: string[]; rule: string; decision?: { currencyCode: string; basis: string } };
    phone?: { source: string; value: string | null; ituContrast: string; note?: string; sharedWith?: string[] };
    timezones?: { source: string; count: number; notInRuntimeIntl: string[] };
  };
}

export interface CanonicalLevel {
  countryCode: string;
  rank: number;
  kind: AreaKind;
  labels: LocalizedText;
  isRequired: boolean;
  reviewStatus: ReviewStatus;
  status: "PROVISIONAL" | "APPROVED";
}

/** Referencia a un área por su identidad de importación (nunca por nombre). */
export interface AreaRef {
  source: string;
  sourceId: string;
}

export interface CanonicalArea {
  countryCode: string;
  rank: number;
  kind: AreaKind;
  parent: AreaRef | null;
  isoCode: string | null;
  source: string;
  sourceId: string;
  name: string;
  nameNormalized: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  disposition: Disposition;
  /** Datos de la fuente conservados para el análisis (no van a la BD). */
  sourceExtra?: Record<string, unknown>;
}

/** Registro de la fuente que no se convierte en área (excluido por regla o rechazado). */
export interface ExcludedRecord {
  source: string;
  sourceId: string;
  name: string;
  reason: string;
  disposition: "EXCLUDED" | "REJECTED" | "REVIEW_REQUIRED";
  sourceExtra?: Record<string, unknown>;
}

export const areaKey = (r: AreaRef) => `${r.source}|${r.sourceId}`;
