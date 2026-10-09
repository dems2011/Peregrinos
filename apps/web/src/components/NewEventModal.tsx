"use client";
import { useState } from "react";
import { EVENT_TYPES, EVENT_TYPE_INFO, type EventType } from "@peregrinos/shared";
import { ApiError, post } from "@/lib/api";
import { ErrorBox, Modal } from "@/components/ui";
import { fromZonedInput } from "@/lib/format";

/** Alta mínima de un evento: el resto se completa después en Evento → Datos del evento. */
export function NewEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [type, setType] = useState<EventType | "">(""); const [name, setName] = useState(""); const [parish, setParish] = useState("");
  const [startsAt, setStartsAt] = useState(""); const [endsAt, setEndsAt] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true); setErr(null);
    try {
      // Se crea en borrador: no queda operativo hasta que el superadministrador lo programe.
      const e = await post<{ id: string }>("/events", {
        type, name, parishName: parish || null, status: "DRAFT",
        // El evento nace con la zona por defecto (DEFAULT_TIMEZONE): la hora ingresada se interpreta en esa zona.
        startsAt: fromZonedInput(startsAt), endsAt: endsAt ? fromZonedInput(endsAt) : null,
      });
      onCreated(e.id);
    } catch (e) { setErr(e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : "No se pudo crear."); } finally { setBusy(false); }
  }
  return (
    <Modal title="Nuevo evento" onClose={onClose}>
      <p className="muted">Cada evento tiene sus propios participantes, inscripciones, asistencias y estadísticas; nunca se mezclan con los de otro. Se crea como borrador.</p>
      <ErrorBox msg={err} />
      <div className="field"><label htmlFor="nt">Tipo de evento</label>
        <select id="nt" value={type} onChange={(e) => setType(e.target.value as EventType)}>
          <option value="" disabled>Elegir…</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_INFO[t].label}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="nn">Nombre</label><input id="nn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Peregrinación de Luján 2027" /></div>
      <div className="field"><label htmlFor="np">Parroquia</label><input id="np" value={parish} onChange={(e) => setParish(e.target.value)} /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="ns">Inicio</label><input id="ns" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
        <div className="field"><label htmlFor="ne">Finalización (opcional)</label><input id="ne" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
      </div>
      <button className="btn btn-primary" disabled={busy || !type || name.trim().length < 3 || !startsAt} onClick={create}>{busy ? "Creando…" : "Crear evento"}</button>
    </Modal>
  );
}
