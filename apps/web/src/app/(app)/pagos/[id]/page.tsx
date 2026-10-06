"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, FileText, IdCard, RotateCcw, TriangleAlert, X } from "lucide-react";
import { api, ApiError, download, post } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDateTime, fmtDoc, money, pad } from "@/lib/format";
import type { RegStatus } from "@/lib/types";
import { useApp, useLive } from "@/components/AppContext";
import { ErrorBox, Loading, Modal, Page, StatusPill } from "@/components/ui";

interface Proof { id: string; mimeType: string; sizeBytes: number; amount: string | null; reference: string | null; paidAt: string | null; note: string | null; status: string; createdAt: string; duplicateOfOther: boolean }
interface Detail { id: string; firstName: string; lastName: string; documentNumber: string; phone: string; status: RegStatus; rejectionReason: string | null; participant: { id: string; number: number } | null; proofs: Proof[] }

export default function RevisarPago() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { event, can } = useApp();
  const eid = event?.id;
  const d = useLoad(() => (eid ? api<Detail>(`/events/${eid}/registrations/${id}`) : Promise.resolve(null)), [eid, id]);
  useLive((t, x) => { if (t === "registration.updated" && x.registrationId === id) d.reload(); });
  const [pi, setPi] = useState(0);
  const [num, setNum] = useState("");
  const [reject, setReject] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!eid || d.loading) return <Page title="Revisar pago" back="/pagos"><Loading /></Page>;
  if (!d.data) return <Page title="Revisar pago" back="/pagos"><ErrorBox msg={d.error ?? "No encontrada."} /></Page>;
  const r = d.data;
  const proof = r.proofs[pi];
  const fileUrl = proof ? `/api/events/${eid}/registrations/${r.id}/proofs/${proof.id}/file` : null;
  const reviewable = r.status === "IN_REVIEW" || r.status === "PENDING_PROOF" || r.status === "REJECTED";

  const approve = async (withoutProof: boolean) => {
    setBusy(true); setErr(null);
    try { await post(`/events/${eid}/registrations/${r.id}/approve`, { withoutProof, ...(num ? { number: Number(num) } : {}) }); d.reload(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo confirmar."); } finally { setBusy(false); }
  };
  const doReopen = async () => {
    setBusy(true); setErr(null);
    try { await post(`/events/${eid}/registrations/${r.id}/reopen`, { reason }); setReopen(false); setReason(""); d.reload(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo reabrir."); } finally { setBusy(false); }
  };
  const doReject = async () => {
    setBusy(true); setErr(null);
    try { await post(`/events/${eid}/registrations/${r.id}/reject`, { reason }); setReject(false); router.replace("/pagos"); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo rechazar."); } finally { setBusy(false); }
  };

  return (
    <Page title="Revisar pago" back="/pagos">
      <ErrorBox msg={err} />
      <section className="card stack-sm">
        <div className="row"><h2>{r.firstName} {r.lastName}</h2><StatusPill s={r.status} /></div>
        <dl className="kv"><dt>Documento</dt><dd>{fmtDoc(r.documentNumber)}</dd><dt>Teléfono</dt><dd><a href={`tel:${r.phone}`}>{r.phone}</a></dd>{event?.registrationFee && <><dt>Monto esperado</dt><dd>{money(event.registrationFee)}</dd></>}</dl>
        {r.status === "REJECTED" && r.rejectionReason && <div className="alert err">Rechazada: {r.rejectionReason}</div>}
      </section>

      {proof ? (
        <section className="card stack">
          <div className="row"><h2>Comprobante {r.proofs.length > 1 ? `(${pi + 1} de ${r.proofs.length})` : ""}</h2>{r.proofs.length > 1 && <div className="btn-row"><button className="btn btn-sm" disabled={pi === 0} onClick={() => setPi(pi - 1)}>Más reciente</button><button className="btn btn-sm" disabled={pi >= r.proofs.length - 1} onClick={() => setPi(pi + 1)}>Anterior</button></div>}</div>
          {proof.duplicateOfOther && <div className="alert err"><TriangleAlert size={18} style={{ verticalAlign: "-3px" }} /> Este mismo archivo ya fue enviado en otra inscripción. Verifica que no se esté reutilizando.</div>}
          <div className="proof-view">
            {proof.mimeType === "application/pdf"
              ? <a className="btn btn-primary" style={{ width: "auto", margin: 24 }} href={fileUrl!} target="_blank" rel="noopener noreferrer"><FileText size={20} /> Abrir PDF del comprobante</a>
              : <img src={fileUrl!} alt="Comprobante de pago enviado por el peregrino" />}
          </div>
          <dl className="kv">
            <dt>Monto declarado</dt><dd>{proof.amount ? money(proof.amount) : "—"}</dd>
            <dt>Referencia</dt><dd>{proof.reference ?? "—"}</dd>
            {proof.paidAt && <><dt>Fecha de pago</dt><dd>{fmtDateTime(proof.paidAt, event?.timezone)}</dd></>}
            <dt>Enviado</dt><dd>{fmtDateTime(proof.createdAt, event?.timezone)}</dd>
            {proof.note && <><dt>Nota</dt><dd>{proof.note}</dd></>}
          </dl>
        </section>
      ) : <div className="alert info">Todavía no envió comprobante.</div>}

      {/* A4: una rechazada no se aprueba directamente; el personal la reabre (vuelve a revisión) con un motivo. */}
      {r.status === "REJECTED" && (
        <section className="card stack">
          <button className="btn" disabled={busy} onClick={() => { setReason(""); setReopen(true); }}><RotateCcw size={20} /> Reabrir revisión</button>
        </section>
      )}
      {reviewable && r.status !== "REJECTED" && (
        <section className="card stack">
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="asg">Número a asignar (opcional)</label><input id="asg" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Si lo dejas vacío se asigna el siguiente" /></div>
          {r.status === "IN_REVIEW"
            ? <button className="btn btn-ok btn-xl" disabled={busy} onClick={() => approve(false)}><BadgeCheck size={26} /> Confirmar pago y asignar número</button>
            : <button className="btn" disabled={busy} onClick={() => { if (confirm("¿Confirmar sin comprobante? (por ejemplo, pago en efectivo). Quedará registrado.")) approve(true); }}>Confirmar sin comprobante (efectivo)</button>}
          <button className="btn btn-danger" disabled={busy} onClick={() => setReject(true)}><X size={20} /> Rechazar</button>
        </section>
      )}

      {(r.status === "APPROVED" && r.participant) && (
        <section className="card stack" style={{ textAlign: "center" }}>
          <BadgeCheck size={52} color="#18A957" style={{ margin: "0 auto" }} />
          <h2>Confirmado · N.º {pad(r.participant.number)}</h2>
          <p className="muted">Ya está en el listado oficial y su credencial está lista.</p>
          {can("credential:export") && <button className="btn btn-primary" onClick={() => download(`/events/${eid}/credentials/participants/${r.participant!.id}`, `credencial-${pad(r.participant!.number)}.pdf`)}><IdCard size={20} /> Descargar credencial (PDF)</button>}
          <button className="btn" onClick={() => router.push(`/personas/${r.participant!.id}`)}>Ver ficha</button>
        </section>
      )}

      {reject && (
        <Modal title="Rechazar inscripción" onClose={() => setReject(false)}>
          <p className="muted">La persona verá el motivo y podrá enviar otro comprobante.</p>
          <div className="field"><label htmlFor="mot">Motivo <span className="req">*</span></label><textarea id="mot" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: el monto no coincide / la imagen no se ve" /></div>
          <button className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={doReject}>Rechazar</button>
        </Modal>
      )}
      {reopen && (
        <Modal title="Reabrir revisión" onClose={() => setReopen(false)}>
          <p className="muted">La inscripción vuelve a «En revisión». Después podrás confirmarla (por ejemplo, si pagó en efectivo). Queda registrado.</p>
          <div className="field"><label htmlFor="rmot">Motivo <span className="req">*</span></label><textarea id="rmot" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: pagó en efectivo en la secretaría" /></div>
          <button className="btn btn-primary" disabled={busy || reason.trim().length < 3} onClick={doReopen}>Reabrir revisión</button>
        </Modal>
      )}
    </Page>
  );
}
