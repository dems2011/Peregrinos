"use client";
import { useState } from "react";
import { CERTIFICATE_STATUSES, CERTIFICATE_STATUS_LABEL, CERTIFICATE_TRANSITIONS, CERTIFICATE_TYPE_LABEL, type CertificateStatus, type CertificateType } from "@peregrinos/shared";
import { api, patch, qs } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useLoad } from "@/lib/hooks";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Modal, Page } from "@/components/ui";

interface Row { id: string; trackingCode: string; type: CertificateType; status: CertificateStatus; requesterName: string; subjectName: string; createdAt: string; updatedAt: string }
interface Detail extends Row {
  requesterEmail: string; requesterPhone: string | null; requesterDocument: string | null; subjectBirthDate: string | null; sacramentYear: number | null;
  sacramentPlace: string | null; parentsNames: string | null; spouseName: string | null; purpose: string | null; details: string | null; publicMessage: string | null;
  history: { id: string; status: CertificateStatus; note: string | null; actor: string | null; createdAt: string }[];
}
const PILL: Record<CertificateStatus, string> = { RECEIVED: "warn", IN_REVIEW: "warn", NEEDS_INFO: "err", READY: "ok", DELIVERED: "gray", REJECTED: "gray" };

/**
 * B5 — Solicitudes de certificados sacramentales (permiso certificate:manage). Datos personales: solo esta pantalla,
 * nunca el perfil público. La entrega exige verificar la identidad de quien retira. No reemplaza los libros oficiales.
 */
export default function Certificados() {
  const { can } = useApp();
  const [status, setStatus] = useState<CertificateStatus | "">("");
  const list = useLoad(() => api<{ items: Row[]; counts: Record<string, number> }>(`/organization/certificates${qs({ status: status || undefined })}`), [status]);
  const [open, setOpen] = useState<string | null>(null);
  if (!can("certificate:manage")) return <Page title="Certificados" back="/configuracion"><div className="alert warn">No tienes permiso para atender solicitudes de certificados.</div></Page>;
  const counts = list.data?.counts ?? {};
  return (
    <Page title="Certificados" back="/configuracion">
      <ErrorBox msg={list.error} />
      <p className="muted small">Las personas piden su partida desde el perfil público de la parroquia («Pedir un certificado») y siguen el estado con su código. Peregrinos gestiona el pedido; el certificado se emite según los libros parroquiales.</p>
      <div className="field"><label htmlFor="cs">Estado</label>
        <select id="cs" value={status} onChange={(e) => setStatus(e.target.value as CertificateStatus | "")}>
          <option value="">Todas</option>{CERTIFICATE_STATUSES.map((s) => <option key={s} value={s}>{CERTIFICATE_STATUS_LABEL[s]} ({counts[s] ?? 0})</option>)}
        </select></div>
      {list.loading && !list.data ? <Loading /> : (
        <div className="card flat">
          {!list.data?.items.length && <div className="empty">No hay solicitudes{status ? " en este estado" : ""}.</div>}
          {list.data?.items.map((r) => (
            <button key={r.id} className="list-item" onClick={() => setOpen(r.id)}>
              <span className="grow"><span className="t">{CERTIFICATE_TYPE_LABEL[r.type]} · {r.subjectName}</span> <span className={`pill ${PILL[r.status]}`}>{CERTIFICATE_STATUS_LABEL[r.status]}</span><br />
                <span className="s">{r.trackingCode} · pidió {r.requesterName} · {fmtDate(r.createdAt)}</span></span>
            </button>
          ))}
        </div>
      )}
      {open && <DetailModal id={open} onClose={() => setOpen(null)} onChanged={() => list.reload()} />}
    </Page>
  );
}

function DetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const d = useLoad(() => api<Detail>(`/organization/certificates/${id}`), [id]);
  const [next, setNext] = useState<CertificateStatus | "">(""); const [note, setNote] = useState(""); const [message, setMessage] = useState<string | null>(null);
  const [verified, setVerified] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const r = d.data;
  const row = (label: string, v: string | number | null | undefined) => (v ? <div className="small"><b>{label}:</b> {v}</div> : null);
  return (
    <Modal title={r ? `${CERTIFICATE_TYPE_LABEL[r.type]} — ${r.trackingCode}` : "Solicitud"} onClose={onClose}>
      <ErrorBox msg={err ?? d.error} />
      {!r ? <Loading /> : (<>
        <p style={{ margin: 0 }}><span className={`pill ${PILL[r.status]}`}>{CERTIFICATE_STATUS_LABEL[r.status]}</span></p>
        <div className="stack-sm" style={{ margin: "10px 0" }}>
          {row("Persona del certificado", r.subjectName)}{row("Nacimiento", r.subjectBirthDate?.slice(0, 10))}{row("Año del sacramento", r.sacramentYear)}
          {row("Lugar", r.sacramentPlace)}{row("Padres", r.parentsNames)}{row("Cónyuge", r.spouseName)}{row("Para qué lo necesita", r.purpose)}{row("Detalles", r.details)}
          <hr />{row("Solicitante", r.requesterName)}{row("Correo", r.requesterEmail)}{row("Teléfono", r.requesterPhone)}{row("Documento", r.requesterDocument)}
        </div>
        <div className="sec-title">Historial</div>
        <ul className="small" style={{ paddingLeft: 18 }}>{r.history.map((h) => <li key={h.id}>{fmtDateTime(h.createdAt)} — {CERTIFICATE_STATUS_LABEL[h.status]}{h.actor ? ` (${h.actor})` : ""}{h.note ? `: ${h.note}` : ""}</li>)}</ul>
        {CERTIFICATE_TRANSITIONS[r.status].length > 0 && (
          <div className="stack-sm">
            <div className="field"><label htmlFor="cn">Nuevo estado</label><select id="cn" value={next} onChange={(e) => setNext(e.target.value as CertificateStatus)}><option value="">Elegir…</option>{CERTIFICATE_TRANSITIONS[r.status].map((s) => <option key={s} value={s}>{CERTIFICATE_STATUS_LABEL[s]}</option>)}</select></div>
            <div className="field"><label htmlFor="cm">Mensaje para el solicitante (lo ve y le llega por correo)</label><textarea id="cm" value={message ?? r.publicMessage ?? ""} maxLength={1000} onChange={(e) => setMessage(e.target.value)} placeholder="Ej.: puede retirarlo el martes de 9 a 12 con su DNI." /></div>
            <div className="field"><label htmlFor="ci">Nota interna (opcional)</label><input id="ci" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></div>
            {next === "DELIVERED" && <label className="check"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Verifiqué la identidad y la autorización de quien retira el certificado</label>}
            <button className="btn btn-primary" disabled={busy || !next || (next === "DELIVERED" && !verified)} onClick={async () => {
              setBusy(true); setErr(null);
              try { await patch(`/organization/certificates/${id}`, { status: next, note: note || null, publicMessage: message ?? r.publicMessage ?? null, identityVerified: next === "DELIVERED" ? verified : undefined }); onChanged(); onClose(); }
              catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
            }}>Guardar estado</button>
          </div>
        )}
      </>)}
    </Modal>
  );
}
