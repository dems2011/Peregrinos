"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Circle, Download, IdCard, KeyRound, Link2, Pencil, RefreshCw, Unlink } from "lucide-react";
import { api, ApiError, download, patch, post } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDateTime, fmtDoc, fmtTime, pad } from "@/lib/format";
import type { Person } from "@/lib/types";
import { useApp, useLive } from "@/components/AppContext";
import { Avatar, copyText, ErrorBox, Loading, Modal, Page, StatusPill } from "@/components/ui";

interface Detail { participant: Person; route: { checkpointId: string; order: number; name: string; arrived: boolean; timestamp: string | null }[]; progress: { done: number; total: number; percent: number } }

export default function FichaPersona() {
  const { id } = useParams<{ id: string }>();
  const { event, can } = useApp();
  const eid = event?.id;
  const d = useLoad(() => (eid ? api<Detail>(`/events/${eid}/participants/${id}`) : Promise.resolve(null)), [eid, id]);
  useLive((t, x) => { if (t === "checkin.created" && x.participantId === id) d.reload(); if (t === "checkin.updated") d.reload(); });
  const [edit, setEdit] = useState(false);
  const [access, setAccess] = useState<{ link: string; code: string } | null>(null);
  const [claim, setClaim] = useState<{ code: string; expiresAt: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const manage = can("participant:manage");
  const [unlink, setUnlink] = useState(false);
  const [unlinkReason, setUnlinkReason] = useState("");
  // A4a: estado de la Person (si ya tiene una cuenta vinculada).
  const personId = d.data?.participant.personId;
  const personInfo = useLoad(() => (personId && manage ? api<{ person: { claimed: boolean } }>(`/persons/${personId}`) : Promise.resolve(null)), [personId, manage]);
  const linked = !!personInfo.data?.person.claimed;

  if (!eid || d.loading) return <Page title="Detalle de persona" back><Loading /></Page>;
  if (!d.data) return <Page title="Detalle de persona" back><ErrorBox msg={d.error ?? "No se encontró a la persona."} /></Page>;
  const { participant: p, route, progress } = d.data;
  const wrap = async (fn: () => Promise<void>) => { setErr(null); setMsg(null); try { await fn(); } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo completar la acción."); } };

  return (
    <Page title="Detalle de persona" back action={manage ? <button className="ic" aria-label="Editar" onClick={() => setEdit(true)}><Pencil size={20} /></button> : undefined}>
      <ErrorBox msg={err} />{msg && <div className="alert ok">{msg}</div>}
      <section className="card stack">
        <div className="row" style={{ justifyContent: "flex-start", gap: 16 }}>
          <Avatar n={p.number} lg />
          <div><h2>{p.firstName} {p.lastName}</h2><StatusPill s={p.status} /></div>
        </div>
        <dl className="kv">
          <dt>Documento</dt><dd>{fmtDoc(p.documentNumber)}</dd>
          {p.phone && <><dt>Teléfono</dt><dd><a href={`tel:${p.phone}`}>{p.phone}</a></dd></>}
          {p.notes && <><dt>Notas</dt><dd>{p.notes}</dd></>}
        </dl>
      </section>

      <section className="card stack">
        <div className="row"><h2>Llegadas</h2><span className="muted">Progreso: {progress.done} de {progress.total} puntos</span></div>
        <div className="progress" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress.percent}%` }} /></div>
        {route.map((r) => (
          <div className="row" key={r.checkpointId}>
            <span className="row" style={{ justifyContent: "flex-start" }}>{r.arrived ? <CheckCircle2 color="#18A957" /> : <Circle color="#B8C6D6" />}<b>Punto {r.order}</b> · {r.name}</span>
            <span className={r.arrived ? "" : "muted"}>{r.arrived && r.timestamp ? `Llegó ${fmtTime(r.timestamp, event?.timezone)}` : "Pendiente"}</span>
          </div>
        ))}
      </section>

      {manage && (
        <section className="card stack">
          <h2>Credencial y acceso</h2>
          <img className="qr-img" src={`/api/events/${eid}/participants/${id}/qr`} alt={`Código QR de la persona ${pad(p.number)}`} />
          <p className="muted" style={{ textAlign: "center" }}>El QR solo contiene un identificador seguro, sin datos personales.</p>
          <div className="btn-row">
            <button className="btn" onClick={() => wrap(() => download(`/events/${eid}/participants/${id}/qr?format=png&download=true`, `qr-${pad(p.number)}.png`))}><Download size={18} /> QR (PNG)</button>
            {can("credential:export") && <button className="btn btn-primary" onClick={() => wrap(() => download(`/events/${eid}/credentials/participants/${id}`, `credencial-${pad(p.number)}.pdf`))}><IdCard size={18} /> Credencial PDF</button>}
          </div>
          <button className="btn" onClick={() => wrap(async () => { setAccess(await post(`/events/${eid}/access/participants/${id}/reissue`)); })}><KeyRound size={18} /> Emitir acceso del peregrino</button>
          <button className="btn" onClick={() => { if (confirm("El QR actual dejará de funcionar. ¿Generar uno nuevo?")) wrap(async () => { await post(`/events/${eid}/participants/${id}/qr/regenerate`); setMsg("QR nuevo generado. Reimprime la credencial."); d.reload(); }); }}><RefreshCw size={18} /> Regenerar QR (credencial perdida)</button>
          {/* A4a: vincular una cuenta Peregrinos a esta persona. El código lo canjea la propia persona desde su cuenta. */}
          {p.personId && !linked && <button className="btn" onClick={() => wrap(async () => { setClaim(await post(`/persons/${p.personId}/claim-code`)); })}><Link2 size={18} /> Código de vinculación de cuenta</button>}
          {/* A4a: corrige un código entregado a la persona equivocada. Solo la organización dueña; con motivo y auditado. */}
          {p.personId && linked && <button className="btn btn-danger" onClick={() => { setUnlinkReason(""); setUnlink(true); }}><Unlink size={18} /> Desvincular cuenta</button>}
        </section>
      )}

      {unlink && (
        <Modal title="Desvincular cuenta" onClose={() => setUnlink(false)}>
          <div className="alert warn">Se deshace la unión que hizo el código de esta organización: sus participaciones vuelven al registro de la organización. La cuenta y lo de otras organizaciones no cambian. Después podrás entregar un código nuevo a la persona correcta.</div>
          <div className="field"><label htmlFor="umot">Motivo <span className="req">*</span></label><textarea id="umot" value={unlinkReason} onChange={(e) => setUnlinkReason(e.target.value)} placeholder="Ej: el código se entregó a otra persona" /></div>
          <button className="btn btn-danger" disabled={unlinkReason.trim().length < 5} onClick={() => wrap(async () => { await post(`/persons/${p.personId}/unlink-account`, { reason: unlinkReason }); setUnlink(false); setMsg("Cuenta desvinculada."); personInfo.reload(); })}>Desvincular</button>
        </Modal>
      )}
      {claim && (
        <Modal title="Código de vinculación de cuenta" onClose={() => setClaim(null)}>
          <div className="alert warn">Entrégalo solo a esta persona. Lo canjea desde su cuenta Peregrinos (o al crearla) y sirve una sola vez. No se vuelve a mostrar.</div>
          <div className="copy-box" style={{ fontSize: 22, fontWeight: 800, letterSpacing: ".12em" }}>{claim.code}</div>
          <p className="muted">Vence el {fmtDateTime(claim.expiresAt, event?.timezone)}.</p>
        </Modal>
      )}

      {access && (
        <Modal title="Acceso del peregrino" onClose={() => setAccess(null)}>
          <div className="alert warn">Guarda estos datos ahora: por seguridad no se vuelven a mostrar. Si los pierdes, se emiten otros nuevos.</div>
          <div><b>Enlace personal</b><div className="copy-box">{access.link}</div></div>
          <div><b>Código de respaldo</b><div className="copy-box" style={{ fontSize: 22, fontWeight: 800, letterSpacing: ".12em" }}>{access.code}</div></div>
          <button className="btn btn-primary" onClick={async () => setMsg((await copyText(`${access.link}\nCódigo: ${access.code}`)) ? "Copiado." : "No se pudo copiar.")}>Copiar enlace y código</button>
        </Modal>
      )}
      {edit && <EditModal p={p} eid={eid} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); d.reload(); }} />}
    </Page>
  );
}

function EditModal({ p, eid, onClose, onSaved }: { p: Person; eid: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ firstName: p.firstName, lastName: p.lastName, phone: p.phone ?? "", documentNumber: p.documentNumber, status: p.status, notes: p.notes ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Editar persona" onClose={onClose}>
      <ErrorBox msg={err} />
      <div className="field"><label>Nombre</label><input value={f.firstName} onChange={set("firstName")} /></div>
      <div className="field"><label>Apellido</label><input value={f.lastName} onChange={set("lastName")} /></div>
      <div className="field"><label>Teléfono</label><input value={f.phone} onChange={set("phone")} inputMode="tel" /></div>
      <div className="field"><label>Documento</label><input value={f.documentNumber} onChange={set("documentNumber")} inputMode="numeric" /></div>
      <div className="field"><label>Estado</label><select value={f.status} onChange={set("status")}><option value="ACTIVE">Activo</option><option value="CANCELLED">Cancelado</option></select></div>
      <div className="field"><label>Notas</label><textarea value={f.notes} onChange={set("notes")} /></div>
      <div className="btn-row"><button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={async () => { try { await patch(`/events/${eid}/participants/${p.id}`, { ...f, notes: f.notes || undefined }); onSaved(); } catch (e) { setErr(e instanceof ApiError ? (e.details?.map((x) => x.message).join(". ") || e.message) : "No se pudo guardar."); } }}>Guardar</button></div>
    </Modal>
  );
}
