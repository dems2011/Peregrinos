"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { MAX_REGISTRATION_FIELDS, REGISTRATION_FIELD_TYPES, REGISTRATION_FIELD_TYPE_LABEL, type RegistrationField, type RegistrationFieldType } from "@peregrinos/shared";
import { ApiError, patch } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Page } from "@/components/ui";

/**
 * B1 — Formulario público de inscripción del evento. Los datos básicos (nombre, apellido, documento y teléfono) son
 * fijos; aquí se agregan las preguntas propias del evento (talle, alergias, parroquia de origen…).
 */
type Draft = RegistrationField & { optionsText?: string };
const newId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export default function Formulario() {
  const { event, can, reloadEvents } = useApp();
  const [fields, setFields] = useState<Draft[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setFields((event?.registrationFields ?? []).map((f) => ({ ...f, optionsText: f.options?.join("\n") ?? "" }))); }, [event?.id, event?.registrationFields]);

  if (!event) return <Page title="Formulario de inscripción" back="/evento"><div className="empty">No hay un evento seleccionado.</div></Page>;
  if (!can("event:update")) return <Page title="Formulario de inscripción" back="/evento"><div className="alert warn">Solo el superadministrador puede editar el formulario.</div></Page>;

  const update = (i: number, p: Partial<Draft>) => { setOk(false); setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...p } : f))); };
  const move = (i: number, dir: -1 | 1) => setFields((fs) => { const c = [...fs]; const t = c[i + dir]; if (!t) return fs; c[i + dir] = c[i]; c[i] = t; return c; });
  async function save() {
    setBusy(true); setErr(null); setOk(false);
    const payload = fields.map(({ optionsText, ...f }) => ({
      ...f, label: f.label.trim(), help: f.help?.trim() || undefined,
      options: f.type === "select" ? (optionsText ?? "").split("\n").map((o) => o.trim()).filter(Boolean) : undefined,
    }));
    try { await patch(`/events/${event!.id}`, { registrationFields: payload }); await reloadEvents(); setOk(true); }
    catch (e) { setErr(e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : "No se pudo guardar."); } finally { setBusy(false); }
  }

  return (
    <Page title="Formulario de inscripción" back="/evento">
      <p className="muted small" style={{ margin: 0 }}>Formulario público de <b>{event.name}</b>. Siempre se piden nombre, apellido, documento y teléfono; agrega aquí las preguntas propias de este evento.</p>
      <ErrorBox msg={err} />
      {ok && <div className="alert ok" role="status">Formulario guardado. Ya lo ven quienes se inscriben.</div>}
      {fields.map((f, i) => (
        <section key={f.id} className="card stack-sm">
          <div className="row"><b>Pregunta {i + 1}</b>
            <span className="btn-row" style={{ flex: "0 0 auto" }}>
              <button className="btn btn-sm" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
              <button className="btn btn-sm" aria-label="Bajar" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
              <button className="btn btn-sm" aria-label="Quitar" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
            </span>
          </div>
          <div className="field"><label htmlFor={`l-${f.id}`}>Pregunta</label><input id={`l-${f.id}`} value={f.label} maxLength={120} onChange={(e) => update(i, { label: e.target.value })} placeholder="Ej.: Talle de remera" /></div>
          <div className="grid2">
            <div className="field"><label htmlFor={`t-${f.id}`}>Tipo de respuesta</label>
              <select id={`t-${f.id}`} value={f.type} onChange={(e) => update(i, { type: e.target.value as RegistrationFieldType })}>
                {REGISTRATION_FIELD_TYPES.map((t) => <option key={t} value={t}>{REGISTRATION_FIELD_TYPE_LABEL[t]}</option>)}
              </select></div>
            <label className="check" style={{ alignSelf: "end" }}><input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} /> Obligatoria</label>
          </div>
          {f.type === "select" && <div className="field"><label htmlFor={`o-${f.id}`}>Opciones (una por línea)</label><textarea id={`o-${f.id}`} value={f.optionsText ?? ""} onChange={(e) => update(i, { optionsText: e.target.value })} placeholder={"S\nM\nL\nXL"} /></div>}
          <div className="field"><label htmlFor={`h-${f.id}`}>Ayuda (opcional)</label><input id={`h-${f.id}`} value={f.help ?? ""} maxLength={200} onChange={(e) => update(i, { help: e.target.value })} /></div>
        </section>
      ))}
      {fields.length < MAX_REGISTRATION_FIELDS
        ? <button className="btn" onClick={() => { setOk(false); setFields((fs) => [...fs, { id: newId(), label: "", type: "text", required: false, optionsText: "" }]); }}><Plus size={18} /> Agregar pregunta</button>
        : <p className="muted small">Llegaste al máximo de {MAX_REGISTRATION_FIELDS} preguntas.</p>}
      <button className="btn btn-primary" disabled={busy || fields.some((f) => f.label.trim().length < 2)} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar formulario"}</button>
    </Page>
  );
}
