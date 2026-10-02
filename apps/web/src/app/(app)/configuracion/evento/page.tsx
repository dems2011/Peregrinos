"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, ApiError, patch, post } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Modal, Page } from "@/components/ui";

const toLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export default function EventoConfig() {
  const { event, reloadEvents, setEventId, can } = useApp();
  const [f, setF] = useState({ name: "", description: "", parishName: "", startsAt: "", status: "SCHEDULED", registrationOpen: false, registrationFee: "", paymentInstructions: "" });
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false); const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!event) return;
    setF({ name: event.name, description: event.description ?? "", parishName: event.parishName ?? "", startsAt: toLocal(event.startsAt), status: event.status, registrationOpen: event.registrationOpen, registrationFee: event.registrationFee ?? "", paymentInstructions: event.paymentInstructions ?? "" });
  }, [event]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!event) return; setBusy(true); setErr(null); setOk(false);
    try {
      await patch(`/events/${event.id}`, {
        name: f.name, description: f.description || undefined, parishName: f.parishName || null, startsAt: new Date(f.startsAt).toISOString(), status: f.status,
        registrationOpen: f.registrationOpen, registrationFee: f.registrationFee === "" ? null : Number(f.registrationFee), paymentInstructions: f.paymentInstructions || null,
      });
      await reloadEvents(); setOk(true);
    } catch (e) { setErr(e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : "No se pudo guardar."); } finally { setBusy(false); }
  }
  if (!can("event:update")) return <Page title="Evento" back="/configuracion"><div className="alert warn">Solo un superadministrador puede editar el evento.</div></Page>;

  return (
    <Page title="Evento e inscripción" back="/configuracion" action={<button className="ic" aria-label="Nuevo evento" onClick={() => setCreating(true)}><Plus size={24} /></button>}>
      {!event ? <div className="empty">No hay eventos todavía.<button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setCreating(true)}>Crear el primer evento</button></div> : (
        <div className="card">
          <ErrorBox msg={err} />{ok && <div className="alert ok" style={{ marginBottom: 12 }}>Cambios guardados.</div>}
          <div className="field"><label htmlFor="en">Nombre del evento</label><input id="en" value={f.name} onChange={set("name")} /></div>
          <div className="field"><label htmlFor="ep">Nombre de la parroquia (se imprime en la credencial)</label><input id="ep" value={f.parishName} onChange={set("parishName")} placeholder="Ej: Parroquia Nuestra Señora de Luján" /></div>
          <div className="grid2">
            <div className="field"><label htmlFor="ed">Fecha y hora de inicio</label><input id="ed" type="datetime-local" value={f.startsAt} onChange={set("startsAt")} /></div>
            <div className="field"><label htmlFor="es">Estado</label><select id="es" value={f.status} onChange={set("status")}><option value="SCHEDULED">Programado</option><option value="IN_PROGRESS">En curso</option><option value="FINISHED">Finalizado</option><option value="CANCELLED">Cancelado</option></select></div>
          </div>
          <div className="field"><label htmlFor="ex">Descripción</label><textarea id="ex" value={f.description} onChange={set("description")} /></div>
          <h3 style={{ margin: "8px 0" }}>Inscripción y pago</h3>
          <label className="check"><input type="checkbox" checked={f.registrationOpen} onChange={(e) => setF({ ...f, registrationOpen: e.target.checked })} /> Inscripción abierta (los peregrinos se registran con un enlace)</label>
          <div className="field"><label htmlFor="ef">Monto de inscripción (ARS)</label><input id="ef" inputMode="decimal" value={f.registrationFee} onChange={set("registrationFee")} /></div>
          <div className="field"><label htmlFor="ei">Instrucciones de pago (alias, CBU, titular…)</label><textarea id="ei" value={f.paymentInstructions} onChange={set("paymentInstructions")} /></div>
          <button className="btn btn-primary" onClick={save} disabled={busy || !f.name.trim()}>{busy ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      )}
      {creating && <NewEvent onClose={() => setCreating(false)} onCreated={async (id) => { await reloadEvents(); setEventId(id); setCreating(false); }} />}
    </Page>
  );
}

function NewEvent({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState(""); const [startsAt, setStartsAt] = useState(""); const [parish, setParish] = useState(""); const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Nuevo evento" onClose={onClose}>
      <p className="muted">Cada evento tiene sus propios participantes, puntos, llegadas y estadísticas; nunca se mezclan con los de otro.</p>
      <ErrorBox msg={err} />
      <div className="field"><label>Nombre</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Peregrinación de Luján 2027" /></div>
      <div className="field"><label>Parroquia</label><input value={parish} onChange={(e) => setParish(e.target.value)} /></div>
      <div className="field"><label>Fecha y hora de inicio</label><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
      <button className="btn btn-primary" disabled={name.trim().length < 3 || !startsAt} onClick={async () => { try { const e = await post<{ id: string }>("/events", { name, startsAt: new Date(startsAt).toISOString(), parishName: parish || null }); onCreated(e.id); } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo crear."); } }}>Crear evento</button>
    </Modal>
  );
}
