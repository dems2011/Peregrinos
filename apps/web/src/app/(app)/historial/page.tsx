"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api, ApiError, post, qs } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDate, fmtTime, pad, startOfDayISO } from "@/lib/format";
import type { Checkin, Checkpoint, Paged } from "@/lib/types";
import { useApp, useLive } from "@/components/AppContext";
import { Avatar, ErrorBox, Loading, Modal, Page, StatusPill } from "@/components/ui";

const RANGES = [["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "Semana"], ["todos", "Todos"]] as const;
type Range = (typeof RANGES)[number][0];
const METHOD = { NUMBER: "Número", QR: "QR", SEARCH: "Búsqueda" };

export default function Historial() {
  const { event, can } = useApp();
  const tz = event?.timezone;
  const [range, setRange] = useState<Range>("hoy");
  const [cp, setCp] = useState("");
  const [status, setStatus] = useState("");
  const [pages, setPages] = useState(1);
  const [sel, setSel] = useState<Checkin | null>(null);
  const eid = event?.id;
  const correct = can("checkin:correct");

  const window_ = (): { from?: string; to?: string } => {
    if (range === "hoy") return { from: startOfDayISO(0, tz) };
    if (range === "ayer") return { from: startOfDayISO(1, tz), to: startOfDayISO(0, tz) };
    if (range === "semana") return { from: startOfDayISO(6, tz) };
    return {};
  };
  const cps = useLoad(() => (eid ? api<{ items: Checkpoint[] }>(`/events/${eid}/checkpoints`) : Promise.resolve(null)), [eid]);
  const list = useLoad(() => (eid ? api<Paged<Checkin>>(`/events/${eid}/checkins${qs({ ...window_(), checkpointId: cp, status, pageSize: 30 * pages })}`) : Promise.resolve(null)), [eid, range, cp, status, pages]);
  const conflicts = useLoad(() => (eid && correct ? api<{ items: { conflict: Checkin; original: Checkin | null }[] }>(`/events/${eid}/checkins/conflicts`) : Promise.resolve(null)), [eid]);
  useLive((t) => { if (t.startsWith("checkin.")) { list.reload(); conflicts.reload(); } });
  const d = list.data;

  return (
    <Page title="Historial de asistencias">
      <div className="tabs">{RANGES.map(([k, l]) => <button key={k} className={`tab ${range === k ? "on" : ""}`} onClick={() => { setRange(k); setPages(1); }}>{l}</button>)}</div>
      <div className="grid2">
        <div className="field" style={{ marginBottom: 0 }}><label htmlFor="fcp">Punto</label><select id="fcp" value={cp} onChange={(e) => { setCp(e.target.value); setPages(1); }}><option value="">Todos</option>{cps.data?.items.map((c) => <option key={c.id} value={c.id}>{c.order}. {c.name}</option>)}</select></div>
        <div className="field" style={{ marginBottom: 0 }}><label htmlFor="fst">Estado</label><select id="fst" value={status} onChange={(e) => { setStatus(e.target.value); setPages(1); }}><option value="">Todos</option><option value="ACTIVE">Válidos</option><option value="CANCELLED">Anulados</option><option value="CONFLICT">En conflicto</option></select></div>
      </div>

      {!!conflicts.data?.items.length && (
        <div className="card stack" style={{ borderColor: "var(--warn)" }}>
          <h2><AlertTriangle size={20} color="#F29B18" style={{ verticalAlign: "-3px" }} /> {conflicts.data.items.length} {conflicts.data.items.length === 1 ? "conflicto" : "conflictos"} por resolver</h2>
          <p className="muted">Dos teléfonos sin conexión registraron a la misma persona en el mismo punto. No se perdió nada: elige cuál conservar.</p>
          {conflicts.data.items.map(({ conflict: c, original: o }) => <ConflictCard key={c.id} c={c} o={o} eid={eid!} tz={tz} onDone={() => { conflicts.reload(); list.reload(); }} />)}
        </div>
      )}

      <ErrorBox msg={list.error} />
      <div className="card flat">
        {list.loading && !d ? <Loading /> : !d?.items.length ? <div className="empty">No hay registros en este período.</div> :
          d.items.map((c) => (
            <button key={c.id} className="list-item" onClick={() => correct && setSel(c)} style={{ cursor: correct ? "pointer" : "default", opacity: c.status === "CANCELLED" ? .6 : 1 }}>
              <Avatar n={c.participant.number} />
              <span className="grow">
                <span className="t" style={{ textDecoration: c.status === "CANCELLED" ? "line-through" : "none" }}>{c.participant.firstName} {c.participant.lastName}</span>{" "}
                {c.status !== "ACTIVE" && <StatusPill s={c.status} />}<br />
                <span className="s">{fmtDate(c.timestamp, tz)} - {fmtTime(c.timestamp, tz)} | {c.checkpoint.name} | {METHOD[c.method]} | {c.operator.name}</span>
              </span>
            </button>
          ))}
      </div>
      {d && d.total > d.items.length && <button className="btn" onClick={() => setPages((p) => p + 1)}>Cargar más ({d.items.length} de {d.total})</button>}
      {sel && <CorrectModal c={sel} eid={eid!} onClose={() => setSel(null)} onDone={() => { setSel(null); list.reload(); }} />}
    </Page>
  );
}

function ConflictCard({ c, o, eid, tz, onDone }: { c: Checkin; o: Checkin | null; eid: string; tz?: string; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const act = async (action: "KEEP_ORIGINAL" | "USE_THIS") => { try { await post(`/events/${eid}/checkins/${c.id}/resolve`, { action }); onDone(); } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo resolver."); } };
  return (
    <div className="stack-sm" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <b>{pad(c.participant.number)} — {c.participant.firstName} {c.participant.lastName} · {c.checkpoint.name}</b>
      <ErrorBox msg={err} />
      {o && <div className="small">Original: {fmtTime(o.timestamp, tz)} · {o.operator.name}</div>}
      <div className="small">Duplicado: {fmtTime(c.timestamp, tz)} · {c.operator.name}</div>
      <div className="btn-row"><button className="btn btn-sm" onClick={() => act("KEEP_ORIGINAL")}>Conservar el original</button><button className="btn btn-sm btn-primary" onClick={() => act("USE_THIS")}>Usar este</button></div>
    </div>
  );
}

function CorrectModal({ c, eid, onClose, onDone }: { c: Checkin; eid: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(""); const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={`${pad(c.participant.number)} — ${c.participant.firstName} ${c.participant.lastName}`} onClose={onClose}>
      <p className="muted">{c.checkpoint.name} · {c.status === "CANCELLED" ? `Anulado: ${c.cancelReason}` : "Registro válido"}</p>
      <ErrorBox msg={err} />
      {c.status !== "CANCELLED" ? (<>
        <div className="field"><label htmlFor="rs">Motivo de la anulación <span className="req">*</span></label><textarea id="rs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: se registró a la persona equivocada" /></div>
        <p className="muted small">El registro no se borra: queda anulado con tu nombre, la fecha y el motivo.</p>
        <button className="btn btn-danger" disabled={reason.trim().length < 3} onClick={async () => { try { await post(`/events/${eid}/checkins/${c.id}/cancel`, { reason }); onDone(); } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo anular."); } }}>Anular registro</button>
      </>) : <p>Este registro ya está anulado.</p>}
    </Modal>
  );
}
