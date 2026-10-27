"use client";
import { useState } from "react";
import { ApiError, api, post } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDateTimeMedium } from "@/lib/format";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";

interface Turn {
  id: string; version: number; title: string; category: string | null; startsAt: string; endsAt: string; location: string | null; note: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN"; decidedAt: string | null; reason: string | null; pushStatus: string | null; receivedAt: string;
}
const STATUS: Record<Turn["status"], [string, string]> = { PENDING: ["Pendiente", "warn"], ACCEPTED: ["Aceptado", "ok"], REJECTED: ["Rechazado", "err"], WITHDRAWN: ["Ya no requiere decisión", ""] };

/**
 * Turnos que la secretaría pide decidir desde SIGyP (permiso turn:decide). Aceptar o rechazar (con motivo) queda guardado
 * aquí al instante; SIGyP lo aplica y avisa a la secretaría en su próxima sincronización (la PC de la parroquia consulta a
 * Peregrinos; Peregrinos nunca entra a ella).
 */
export default function Turnos() {
  const { can, reloadCounters } = useApp();
  const allowed = can("turn:decide");
  const list = useLoad(() => (allowed ? api<{ pending: Turn[]; recent: Turn[]; agenda?: Turn[] }>("/organization/turns") : Promise.resolve(null)), [allowed]);
  if (!allowed) return <Page title="Turnos"><div className="alert warn">No tienes permiso para decidir turnos.</div></Page>;
  const tz: string | undefined = undefined; // zona por defecto de la organización (DEFAULT_TIMEZONE)
  const done = async () => { await list.reload(); await reloadCounters(); };
  return (
    <Page title="Turnos">
      <p className="muted small" style={{ marginTop: 0 }}>Pedidos de la secretaría desde SIGyP. Tu decisión llega a SIGyP en su próxima sincronización.</p>
      <ErrorBox msg={list.error} />
      {!list.data ? !list.error && <Loading /> : (
        <>
          <h2>Para decidir ({list.data.pending.length})</h2>
          {list.data.pending.length === 0 && <p className="muted" data-testid="turns-empty">No hay turnos pendientes.</p>}
          <div className="stack">{list.data.pending.map((t) => <PendingTurn key={`${t.id}:${t.version}`} t={t} tz={tz} onDone={done} />)}</div>
          <h2>Mi agenda ({list.data.agenda?.length ?? 0})</h2>
          {!list.data.agenda?.length ? <p className="muted">No hay turnos aceptados próximos.</p> : (
            <div className="stack-sm" data-testid="turns-agenda">
              {list.data.agenda.map((t) => (
                <div key={t.id} className="card small">
                  <b>{fmtDateTimeMedium(t.startsAt, tz)} – {fmtDateTimeMedium(t.endsAt, tz, undefined, false)}</b> · {t.title}{t.location && <span className="muted"> · {t.location}</span>}
                </div>
              ))}
            </div>
          )}
          {list.data.recent.length > 0 && (
            <>
              <h2>Recientes</h2>
              <div className="stack-sm">
                {list.data.recent.map((t) => (
                  <div key={t.id} className="card small">
                    <b>{t.title}</b> · {fmtDateTimeMedium(t.startsAt, tz)} <span className={`pill ${STATUS[t.status][1]}`}>{STATUS[t.status][0]}</span>
                    {t.reason && <div className="muted">Motivo: {t.reason}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}

function PendingTurn({ t, tz, onDone }: { t: Turn; tz?: string; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const decide = async (decision: "ACCEPTED" | "REJECTED") => {
    setBusy(true); setErr(null);
    try {
      await post(`/organization/turns/${t.id}/decision`, { decision, version: t.version, ...(decision === "REJECTED" ? { reason: reason.trim() } : {}) });
      await onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "No se pudo guardar la decisión.");
      if (e instanceof ApiError && e.status === 409) await onDone();
    } finally { setBusy(false); }
  };
  return (
    <section className="card stack-sm" data-testid="turn-pending">
      <div><b>{t.title}</b>{t.category && <span className="muted"> · {t.category}</span>}</div>
      <div>{fmtDateTimeMedium(t.startsAt, tz)} – {fmtDateTimeMedium(t.endsAt, tz, undefined, false)}{t.location && <> · {t.location}</>}</div>
      {t.note && <div className="muted small">{t.note}</div>}
      <ErrorBox msg={err} />
      {rejecting ? (
        <>
          <label className="field">
            <span className="small">Motivo del rechazo (lo verá la secretaría)</span>
            <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="btn-row">
            <button type="button" className="btn" disabled={busy || reason.trim().length < 5} onClick={() => void decide("REJECTED")}>Confirmar rechazo</button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setRejecting(false)}>Volver</button>
          </div>
        </>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void decide("ACCEPTED")}>Aceptar</button>
          <button type="button" className="btn" disabled={busy} onClick={() => setRejecting(true)}>Rechazar</button>
        </div>
      )}
    </section>
  );
}
