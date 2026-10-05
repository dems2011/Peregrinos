"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Plus } from "lucide-react";
import { EVENT_STATUSES, EVENT_STATUS_LABEL, EVENT_TYPES, EVENT_TYPE_INFO } from "@peregrinos/shared";
import { useApp } from "@/components/AppContext";
import { NewEventModal } from "@/components/NewEventModal";
import { Page, StatusPill } from "@/components/ui";
import { fmtDate } from "@/lib/format";

/** Todos los eventos de la parroquia: filtrar, elegir con cuál trabajar y crear nuevos. */
export default function Eventos() {
  const router = useRouter();
  const { events, event, setEventId, reloadEvents, can } = useApp();
  const [type, setType] = useState(""); const [status, setStatus] = useState(""); const [creating, setCreating] = useState(false);
  const list = events.filter((e) => (!type || e.type === type) && (!status || e.status === status));

  return (
    <Page title="Eventos" back="/configuracion" action={can("event:create") ? <button className="ic" aria-label="Nuevo evento" onClick={() => setCreating(true)}><Plus size={24} /></button> : undefined}>
      <div className="grid2">
        <div className="field"><label htmlFor="ft">Tipo</label><select id="ft" value={type} onChange={(e) => setType(e.target.value)}><option value="">Todos</option>{EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_INFO[t].label}</option>)}</select></div>
        <div className="field"><label htmlFor="fs">Estado</label><select id="fs" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option>{EVENT_STATUSES.map((s) => <option key={s} value={s}>{EVENT_STATUS_LABEL[s]}</option>)}</select></div>
      </div>
      {list.length === 0 ? <div className="empty">{events.length ? "Ningún evento coincide con el filtro." : "No hay eventos todavía."}</div> : (
        <div className="card flat">
          {list.map((e) => (
            <button key={e.id} className="list-item" onClick={() => { setEventId(e.id); router.push("/configuracion/evento"); }}>
              <span className="grow">
                <span className="t">{e.name}</span>{e.id === event?.id && <CheckCircle2 size={16} color="#18A957" aria-label="Evento activo" style={{ marginLeft: 6, verticalAlign: "-2px" }} />}<br />
                <span className="s">{EVENT_TYPE_INFO[e.type].label} · {fmtDate(e.startsAt, e.timezone)}{e.endsAt ? ` – ${fmtDate(e.endsAt, e.timezone)}` : ""} · {e._count.participants} personas</span>
              </span>
              <StatusPill s={e.status} /><ChevronRight className="chev" />
            </button>
          ))}
        </div>
      )}
      {creating && <NewEventModal onClose={() => setCreating(false)} onCreated={async (id) => { await reloadEvents(); setEventId(id); setCreating(false); router.push("/configuracion/evento"); }} />}
    </Page>
  );
}
