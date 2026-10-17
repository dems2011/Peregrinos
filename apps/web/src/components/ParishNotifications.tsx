"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { NOTICE_AUDIENCE_LABEL, type NoticeAudience } from "@peregrinos/shared";
import { ApiError, api, post } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { ErrorBox } from "@/components/ui";
import { fmtDateTimeMedium, viewerTimeZone } from "@/lib/format";

/**
 * B1 + avisos multigrupo — Avisos de la parroquia. «Enviar a» ofrece SOLO los grupos que la API permite a esta persona
 * (seguidores; administración y personal según roles reales). Antes de enviar se muestra el total SIN duplicados (quien
 * está en dos grupos recibe un aviso) y hay que confirmarlo: si cambió, la API lo rechaza. Push o solo bandeja; la
 * alerta urgente exige motivo y confirmación. «Limpiar avisos enviados» es solo de esta vista (no borra nada).
 */
interface Sent {
  id: string; kind: "MANUAL" | "EVENT_PUBLISHED" | "LIVESTREAM" | "BULLETIN"; title: string; body: string; recipientCount: number; readCount: number; createdAt: string;
  event: { name: string } | null; delivery?: string; urgent?: boolean; audience?: string[] | null; sourceSystem?: string | null;
}
interface Audiences { allowed: NoticeAudience[]; counts: Record<string, number>; selected: string[]; uniqueRecipients: number; canSendUrgent: boolean }

export function ParishNotifications({ viewerId }: { followers?: number; viewerId?: string }) {
  const list = useLoad(() => api<{ items: Sent[] }>("/organization/notifications"), []);
  const [sel, setSel] = useState<NoticeAudience[]>(["FOLLOWERS"]);
  const aud = useLoad(() => api<Audiences>(`/organization/notifications/audiences?audiences=${encodeURIComponent(sel.join(","))}`), [sel.join(",")]);
  const [f, setF] = useState({ title: "", body: "", delivery: "PUSH" as "PUSH" | "INBOX", urgent: false, urgentReason: "" });
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clearKey = `pg_notices_cleared:${viewerId ?? "-"}`;
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  useEffect(() => { try { setClearedAt(localStorage.getItem(clearKey)); } catch { setClearedAt(null); /* sin almacenamiento */ } }, [clearKey]);
  useEffect(() => { setConfirmed(false); }, [sel.join(","), f.urgent, f.delivery]); // eslint-disable-line react-hooks/exhaustive-deps
  const allowed = aud.data?.allowed ?? [];
  const total = aud.data?.uniqueRecipients ?? 0;
  const all = list.data?.items ?? [];
  const shown = clearedAt ? all.filter((n) => +new Date(n.createdAt) > +new Date(clearedAt)) : all;
  const toggle = (a: NoticeAudience) => setSel(sel.includes(a) ? sel.filter((x) => x !== a) : [...sel, a]);
  function clearOld() {
    const cut = all.reduce<string | null>((a, n) => (!a || +new Date(n.createdAt) > +new Date(a) ? n.createdAt : a), null);
    if (!cut || !window.confirm("¿Limpiar la lista de avisos enviados? Solo dejan de verse aquí: no se borran y los destinatarios los conservan.")) return;
    try { localStorage.setItem(clearKey, cut); } catch { /* sin almacenamiento */ }
    setClearedAt(cut);
  }
  function showOld() { try { localStorage.removeItem(clearKey); } catch { /* sin almacenamiento */ } setClearedAt(null); }
  async function send(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setOk(null);
    try {
      const r = await post<{ recipientCount: number; delivery: string }>("/organization/notifications/multi", {
        title: f.title, body: f.body, audiences: sel, delivery: f.urgent ? "PUSH" : f.delivery, urgent: f.urgent,
        urgentReason: f.urgent ? f.urgentReason : null, confirmedRecipients: total,
      });
      setOk(`Aviso registrado para ${r.recipientCount} ${r.recipientCount === 1 ? "persona" : "personas"}${r.delivery === "PUSH" ? " (bandeja y notificación al teléfono, si tienen la aplicación con avisos activados)" : " (solo en la bandeja)"}.`);
      setF({ title: "", body: "", delivery: "PUSH", urgent: false, urgentReason: "" }); setConfirmed(false); await list.reload(); await aud.reload();
    } catch (e2) { setErr(e2 instanceof ApiError ? (e2.details?.map((d) => d.message).join(". ") || e2.message) : "No se pudo enviar."); await aud.reload(); } finally { setBusy(false); }
  }
  const ready = f.title.trim().length >= 3 && f.body.trim().length >= 3 && sel.length > 0 && total > 0 && confirmed && (!f.urgent || f.urgentReason.trim().length >= 10);
  return (
    <section className="card stack-sm">
      <h2>Avisos</h2>
      <p className="muted small" style={{ margin: 0 }}>El aviso llega a la bandeja «Avisos» de cada destinatario. Al publicar un evento público desde este panel se avisa automáticamente a los seguidores (los eventos publicados desde SIGyP no avisan solos).</p>
      {ok && <div className="alert ok" role="status">{ok}</div>}
      <ErrorBox msg={err ?? aud.error} />
      <form onSubmit={send} noValidate className="stack-sm">
        <fieldset className="stack-sm" style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: 10 }}>
          <legend><b>Enviar a</b></legend>
          {!allowed.length && <p className="muted small" style={{ margin: 0 }}>Tu función no permite enviar avisos.</p>}
          {allowed.map((a) => (
            <label key={a} className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
              <input type="checkbox" checked={sel.includes(a)} onChange={() => toggle(a)} />
              <span>{NOTICE_AUDIENCE_LABEL[a]} <span className="muted small">({aud.data?.counts[a] ?? 0})</span></span>
            </label>
          ))}
          <p className="small" style={{ margin: 0 }} aria-live="polite">Destinatarios únicos: <b>{total}</b>{sel.length > 1 ? " (quien está en más de un grupo recibe un solo aviso)" : ""}</p>
        </fieldset>
        <div className="field"><label htmlFor="nt-t">Título</label><input id="nt-t" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="field"><label htmlFor="nt-b">Mensaje</label><textarea id="nt-b" value={f.body} maxLength={2000} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        {!f.urgent && (
          <div className="field">
            <label htmlFor="nt-d">Tipo de aviso</label>
            <select id="nt-d" value={f.delivery} onChange={(e) => setF({ ...f, delivery: e.target.value as "PUSH" | "INBOX" })}>
              <option value="PUSH">Bandeja y notificación al teléfono</option>
              <option value="INBOX">Solo en la bandeja (sin notificación)</option>
            </select>
          </div>
        )}
        {aud.data?.canSendUrgent && (
          <label className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
            <input type="checkbox" checked={f.urgent} onChange={(e) => setF({ ...f, urgent: e.target.checked })} />
            <span>Alerta urgente (solo para situaciones que lo justifiquen)</span>
          </label>
        )}
        {f.urgent && <div className="field"><label htmlFor="nt-u">Motivo de la alerta urgente (queda registrado)</label><input id="nt-u" value={f.urgentReason} maxLength={300} onChange={(e) => setF({ ...f, urgentReason: e.target.value })} /></div>}
        <label className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
          <input type="checkbox" checked={confirmed} disabled={total === 0} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>Confirmo que el aviso se enviará a <b>{total}</b> {total === 1 ? "persona" : "personas"}: {sel.map((a) => NOTICE_AUDIENCE_LABEL[a]).join(", ") || "—"}.</span>
        </label>
        <button className="btn btn-primary" disabled={busy || !ready}><Send size={18} /> {busy ? "Enviando…" : f.urgent ? "Enviar alerta urgente" : "Enviar aviso"}</button>
      </form>
      {(shown.length > 0 || clearedAt) && (
        <div className="btn-row">
          {shown.length > 0 && <button type="button" className="btn" onClick={clearOld}>Limpiar avisos enviados</button>}
          {clearedAt && <button type="button" className="btn" onClick={showOld}>Mostrar anteriores</button>}
        </div>
      )}
      {clearedAt && !shown.length && <p className="muted small" style={{ margin: 0 }}>Limpiaste los avisos enviados. Aquí verás los nuevos.</p>}
      {!!shown.length && <>
        <h3 style={{ margin: "8px 0 0" }}>Enviados</h3>
        {shown.map((n) => (
          <div key={n.id} className="acct-item">
            <div className="row"><b style={{ overflowWrap: "anywhere" }}>{n.title}</b><span className="pill gray">{n.urgent ? "Urgente" : n.kind === "EVENT_PUBLISHED" ? "Automático" : n.sourceSystem === "SIGYP" ? "Desde SIGyP" : "Manual"}</span></div>
            <div className="muted small">
              {fmtDateTimeMedium(n.createdAt, viewerTimeZone())} · {n.recipientCount} destinatarios · {n.readCount} lo leyeron
              {n.audience?.length ? ` · ${n.audience.map((a) => NOTICE_AUDIENCE_LABEL[a as NoticeAudience] ?? a).join(", ")}` : ""}{n.delivery === "INBOX" ? " · solo bandeja" : ""}
            </div>
          </div>
        ))}
      </>}
    </section>
  );
}
