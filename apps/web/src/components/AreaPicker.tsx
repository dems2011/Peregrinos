"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "@peregrinos/shared";
import { api, qs } from "@/lib/api";

/**
 * Selección encadenada de país y áreas administrativas (ARQUITECTURA-INTERNACIONAL §6).
 * Cada paso muestra los hijos REALES del área elegida (GET /api/geo/areas), con la etiqueta de su nivel
 * (GET /api/geo/countries/:code/levels). Los niveles pueden saltarse: la etiqueta sale del rank de los hijos.
 * Siempre ofrece "No encuentro mi localidad" para escribirla a mano (Address.localityText).
 *
 * Concurrencia: toda petición que reemplaza columnas aborta la anterior (AbortController), así una respuesta
 * lenta de un país/área ya descartado nunca pisa la selección actual.
 */

export type GeoLocale = Locale;
export type AreaKind = "ADMIN" | "LOCALITY";
export type AreaPathItem = { id: string; name: string; kind: AreaKind; rank: number };
/** areaId = área más profunda elegida (o null). Con freeText, la localidad escrita cuelga de esa área. */
export type AreaPickerValue = { countryCode: string; areaId: string | null; path: AreaPathItem[]; freeText?: string };

type Country = { code: string; name: string };
type Level = { rank: number; kind: AreaKind; label: string | null; isRequired: boolean };
type AreaOption = AreaPathItem & { isoCode: string | null; hasChildren: boolean };
type Column = { parentId: string | null; options: AreaOption[]; truncated: boolean; q: string; loading: boolean };

const MISSING = "__missing__";
/** A partir de esta cantidad (o si la lista viene truncada) se ofrece el filtro de texto. */
const FILTER_THRESHOLD = 25;
const PAGE = 200;
const FREE_TEXT_MAX = 120;
const FILTER_DELAY_MS = 300;

/** Textos de la interfaz por idioma (los nombres de países/niveles vienen localizados del API). */
const UI: Record<GeoLocale, {
  country: string; chooseCountry: string; loading: string; searching: string; choose: (n: string) => string;
  search: (n: string) => string; noResults: (q: string) => string; more: string; missing: string; locality: string;
  area: string; freePlaceholder: string; within: (n: string) => string; asKnown: string; loadingNext: string;
  errCountries: string; errDivisions: string; errOptions: string; retry: string; required: string;
}> = {
  es: {
    country: "País", chooseCountry: "Selecciona un país", loading: "Cargando…", searching: "Buscando…",
    choose: (n) => `Selecciona ${n}`, search: (n) => `Buscar ${n} (mínimo 2 letras)`, noResults: (q) => `Sin resultados para “${q}”.`,
    more: "Hay más resultados: escribe para filtrar.", missing: "No encuentro mi localidad", locality: "Localidad", area: "Área",
    freePlaceholder: "Escribe el nombre de tu localidad", within: (n) => `Se guardará dentro de ${n}.`, asKnown: "Escríbela tal como la conoces.",
    loadingNext: "Cargando opciones…", errCountries: "No se pudo cargar la lista de países.",
    errDivisions: "No se pudieron cargar las divisiones del país.", errOptions: "No se pudieron cargar las opciones.", retry: "Reintentar",
    required: "obligatorio",
  },
  en: {
    country: "Country", chooseCountry: "Select a country", loading: "Loading…", searching: "Searching…",
    choose: (n) => `Select ${n}`, search: (n) => `Search ${n} (at least 2 letters)`, noResults: (q) => `No results for “${q}”.`,
    more: "There are more results: type to filter.", missing: "I can't find my town", locality: "Town / city", area: "Area",
    freePlaceholder: "Type the name of your town", within: (n) => `It will be saved within ${n}.`, asKnown: "Type it as you know it.",
    loadingNext: "Loading options…", errCountries: "Could not load the list of countries.",
    errDivisions: "Could not load the country's divisions.", errOptions: "Could not load the options.", retry: "Retry",
    required: "required",
  },
  pt: {
    country: "País", chooseCountry: "Selecione um país", loading: "Carregando…", searching: "Buscando…",
    choose: (n) => `Selecione ${n}`, search: (n) => `Buscar ${n} (mínimo 2 letras)`, noResults: (q) => `Sem resultados para “${q}”.`,
    more: "Há mais resultados: digite para filtrar.", missing: "Não encontro minha localidade", locality: "Localidade", area: "Área",
    freePlaceholder: "Digite o nome da sua localidade", within: (n) => `Será salva dentro de ${n}.`, asKnown: "Digite como você a conhece.",
    loadingNext: "Carregando opções…", errCountries: "Não foi possível carregar a lista de países.",
    errDivisions: "Não foi possível carregar as divisões do país.", errOptions: "Não foi possível carregar as opções.", retry: "Tentar novamente",
    required: "obrigatório",
  },
  it: {
    country: "Paese", chooseCountry: "Seleziona un paese", loading: "Caricamento…", searching: "Ricerca…",
    choose: (n) => `Seleziona ${n}`, search: (n) => `Cerca ${n} (almeno 2 lettere)`, noResults: (q) => `Nessun risultato per “${q}”.`,
    more: "Ci sono altri risultati: scrivi per filtrare.", missing: "Non trovo la mia località", locality: "Località", area: "Area",
    freePlaceholder: "Scrivi il nome della tua località", within: (n) => `Sarà salvata in ${n}.`, asKnown: "Scrivila come la conosci.",
    loadingNext: "Caricamento opzioni…", errCountries: "Impossibile caricare l'elenco dei paesi.",
    errDivisions: "Impossibile caricare le suddivisioni del paese.", errOptions: "Impossibile caricare le opzioni.", retry: "Riprova",
    required: "obbligatorio",
  },
};

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export function AreaPicker({
  onChange, locale = "es", defaultCountry, label, disabled = false, onUnavailable,
}: {
  onChange: (v: AreaPickerValue | null) => void;
  locale?: GeoLocale;
  defaultCountry?: string;
  label?: string;
  disabled?: boolean;
  /** Se llama si no hay países para elegir (catálogo sin cargar o error): el formulario puede ofrecer otra entrada. */
  onUnavailable?: () => void;
}) {
  const t = UI[locale] ?? UI.es;
  const uid = useId();
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [country, setCountry] = useState(/^[A-Za-z]{2}$/.test(defaultCountry ?? "") ? defaultCountry!.toUpperCase() : "");
  const [levels, setLevels] = useState<Level[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [path, setPath] = useState<AreaPathItem[]>([]);
  const [missing, setMissing] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [loadingNext, setLoadingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Reintento: vuelve a pedir países y las divisiones del país actual. */
  const [reload, setReload] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  /** Una sola petición "de columnas" viva a la vez: cada nueva aborta la anterior. */
  const colCtl = useRef<AbortController | null>(null);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function nextSignal() {
    colCtl.current?.abort();
    clearTimeout(filterTimer.current);
    colCtl.current = new AbortController();
    return colCtl.current.signal;
  }
  useEffect(() => () => { colCtl.current?.abort(); clearTimeout(filterTimer.current); }, []);

  useEffect(() => {
    const ctl = new AbortController();
    setCountries(null);
    api<{ countries: Country[] }>(`/geo/countries${qs({ locale })}`, { signal: ctl.signal })
      .then((r) => { setCountries(r.countries); if (!r.countries.length) onUnavailableRef.current?.(); })
      .catch((e) => { if (!isAbort(e)) { setCountries([]); setError(t.errCountries); onUnavailableRef.current?.(); } });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, reload]);

  async function fetchColumn(code: string, parentId: string | null, q: string, signal: AbortSignal): Promise<Column> {
    const term = q.trim();
    const r = await api<{ areas: AreaOption[]; truncated: boolean }>(
      `/geo/areas${qs({ country: code, parentId: parentId ?? undefined, q: term.length >= 2 ? term : undefined, limit: PAGE })}`,
      { signal },
    );
    return { parentId, options: r.areas, truncated: r.truncated, q, loading: false };
  }

  // Al cambiar de país: niveles + primer nivel de áreas.
  useEffect(() => {
    setColumns([]); setPath([]); setLevels([]); setMissing(false); setFreeText(""); setError(null); setLoadingNext(false);
    if (!country) { colCtl.current?.abort(); return; }
    const signal = nextSignal();
    setLoadingNext(true);
    Promise.all([
      api<{ levels: Level[] }>(`/geo/countries/${encodeURIComponent(country)}/levels${qs({ locale })}`, { signal }),
      fetchColumn(country, null, "", signal),
    ])
      .then(([lv, col]) => {
        setLevels(lv.levels);
        setColumns([col]);
        if (col.options.length === 0) setMissing(true); // País sin divisiones cargadas: solo texto libre.
      })
      .catch((e) => { if (!isAbort(e)) { setError(t.errDivisions); setMissing(true); } })
      .finally(() => { if (!signal.aborted) setLoadingNext(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, locale, reload]);

  // Informa al padre ante cualquier cambio.
  useEffect(() => {
    if (!country) { onChangeRef.current(null); return; }
    const last = path[path.length - 1];
    const text = freeText.trim();
    onChangeRef.current({ countryCode: country, areaId: last?.id ?? null, path, ...(missing && text ? { freeText: text } : {}) });
  }, [country, path, missing, freeText]);

  async function choose(index: number, value: string) {
    const col = columns[index];
    if (!col) return;
    const signal = nextSignal(); // Cualquier carga/filtro pendiente queda obsoleto.
    setLoadingNext(false); setError(null);
    // Un filtro pendiente en esta columna se cancela: la columna deja de estar "buscando".
    const keep = columns.slice(0, index + 1).map((c, i) => (i === index && c.loading ? { ...c, loading: false } : c));
    if (value === MISSING) {
      setPath(path.slice(0, index)); setColumns(keep); setMissing(true);
      return;
    }
    setMissing(false); setFreeText("");
    const opt = col.options.find((o) => o.id === value);
    setPath(opt ? [...path.slice(0, index), { id: opt.id, name: opt.name, kind: opt.kind, rank: opt.rank }] : path.slice(0, index));
    setColumns(keep);
    if (!opt?.hasChildren) return;
    setLoadingNext(true);
    try {
      const next = await fetchColumn(country, opt.id, "", signal);
      setColumns([...keep, next]);
    } catch (e) {
      if (!isAbort(e)) setError(t.errOptions);
    } finally {
      if (!signal.aborted) setLoadingNext(false);
    }
  }

  // Filtro de texto por columna (con espera breve para no consultar en cada tecla).
  function filter(index: number, q: string) {
    const parentId = columns[index]?.parentId ?? null;
    const signal = nextSignal();
    setLoadingNext(false);
    // Filtrar invalida la elección de este nivel y de los inferiores.
    setPath((p) => p.slice(0, index)); setMissing(false); setFreeText("");
    setColumns((cs) => cs.slice(0, index + 1).map((c, i) => (i === index ? { ...c, q, loading: true } : c)));
    filterTimer.current = setTimeout(async () => {
      try {
        const col = await fetchColumn(country, parentId, q, signal);
        setColumns((cs) => (cs[index]?.parentId === parentId && cs[index].q === q ? cs.map((c, i) => (i === index ? col : c)) : cs));
      } catch (e) {
        if (isAbort(e)) return;
        setError(t.errOptions);
        setColumns((cs) => cs.map((c, i) => (i === index ? { ...c, loading: false } : c)));
      }
    }, FILTER_DELAY_MS);
  }

  const levelLabel = (col: Column) => {
    const ranks = [...new Set(col.options.map((o) => o.rank))];
    const lv = ranks.length === 1 ? levels.find((l) => l.rank === ranks[0]) : undefined;
    return lv?.label ?? (col.options.length && col.options.every((o) => o.kind === "LOCALITY") ? t.locality : t.area);
  };
  const isRequired = (col: Column) => {
    const ranks = new Set(col.options.map((o) => o.rank));
    return levels.some((l) => ranks.has(l.rank) && l.isRequired);
  };
  const lower = (s: string) => s.toLocaleLowerCase(locale);

  return (
    <div className="stack-sm" role="group" aria-labelledby={`${uid}-country-label`}>
      {error && (
        <div className="alert err" role="alert">
          {error}{" "}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setError(null); setReload((n) => n + 1); }}>{t.retry}</button>
        </div>
      )}

      <div className="field">
        <label id={`${uid}-country-label`} htmlFor={`${uid}-country`}>{label ?? t.country}</label>
        <select
          id={`${uid}-country`} value={country} onChange={(e) => setCountry(e.target.value)}
          disabled={disabled || countries === null} aria-busy={countries === null} autoComplete="country"
        >
          <option value="">{countries === null ? t.loading : t.chooseCountry}</option>
          {countries?.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>

      {columns.map((col, i) => {
        if (col.options.length === 0 && !col.q) return null;
        const id = `${uid}-lvl-${i}`;
        const hintId = `${uid}-lvl-${i}-hint`;
        const name = levelLabel(col);
        const showFilter = col.truncated || col.options.length > FILTER_THRESHOLD || !!col.q;
        const selected = path[i]?.id ?? (missing && i === path.length ? MISSING : "");
        const required = isRequired(col);
        const noResults = !!col.q && !col.loading && col.options.length === 0;
        return (
          <div className="field" key={`${col.parentId ?? "root"}-${i}`}>
            <label htmlFor={id}>{name}{required && <span className="req" aria-hidden="true"> *</span>}</label>
            {showFilter && (
              <input
                type="search" inputMode="search" autoComplete="off" maxLength={80} aria-label={t.search(lower(name))} aria-controls={id}
                placeholder={t.search(lower(name))} value={col.q} disabled={disabled}
                onChange={(e) => filter(i, e.target.value)}
              />
            )}
            <select
              id={id} value={selected} onChange={(e) => choose(i, e.target.value)} disabled={disabled}
              aria-busy={col.loading} aria-required={required || undefined} aria-describedby={noResults || col.truncated ? hintId : undefined}
            >
              <option value="">{col.loading ? t.searching : t.choose(lower(name))}</option>
              {col.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              <option value={MISSING}>{t.missing}</option>
            </select>
            {noResults && <span id={hintId} className="hint">{t.noResults(col.q)}</span>}
            {!noResults && col.truncated && <span id={hintId} className="hint">{t.more}</span>}
          </div>
        );
      })}

      <span className="hint" role="status" aria-live="polite">{loadingNext ? t.loadingNext : ""}</span>

      {country && columns.length > 0 && !missing && (
        <button
          type="button" className="btn btn-ghost btn-sm" disabled={disabled}
          onClick={() => { colCtl.current?.abort(); setLoadingNext(false); setColumns(columns.slice(0, path.length + 1)); setMissing(true); }}
        >
          {t.missing}
        </button>
      )}

      {country && missing && (
        <div className="field">
          <label htmlFor={`${uid}-free`}>{t.locality}</label>
          <input
            id={`${uid}-free`} type="text" autoComplete="address-level2" maxLength={FREE_TEXT_MAX} value={freeText} disabled={disabled}
            onChange={(e) => setFreeText(e.target.value)} placeholder={t.freePlaceholder} aria-describedby={`${uid}-free-hint`}
          />
          <span id={`${uid}-free-hint`} className="hint">
            {path.length ? t.within(path[path.length - 1].name) : t.asKnown}
          </span>
        </div>
      )}
    </div>
  );
}

export default AreaPicker;
