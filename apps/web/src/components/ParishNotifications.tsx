"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { ApiError, api, post } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { ErrorBox } from "@/components/ui";
import { fmtDateTimeMedium, viewerTimeZone } from "@/lib/format";

/**
 * B1 — Avisos a todos los seguidores de la parroquia (solo el superadministrador; la API lo exige).
 * «Limpiar avisos enviados» es solo de esta vista (igual que en el chat): guarda en este dispositivo la hora (del
 * servidor) del último aviso enviado y desde entonces lista solo los posteriores. No borra avisos ni cambia lo que
 * recibieron los seguidores; «Mostrar anteriores» lo deshace.
 */
interface Sent { id: string; kind: "MANUAL" | "EVENT_PUBLISHED"; title: string; body: string; recipientCount: number; readCount: number; createdAt: string; event: { name: string } | null }

export function ParishNotifications({ followers, viewerId }: { followers: number; viewerId?: string }) {
  const list = useLoad(() => api<{ items: Sent[] }>("/organization/notifications"), []);
  const [f, setF] = useState({ title: "", body: "" });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clearKey = `pg_notices_cleared:${viewerId ?? "-"}`;
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  useEffect(() => { try { setClearedAt(localStorage.getItem(clearKey)); } catch { setClearedAt(null); /* sin almacenamiento */ } }, [clearKey]);
  const all = list.data?.items ?? [];
  const shown = clearedAt ? all.filter((n) => +new Date(n.createdAt) > +new Date(clearedAt)) : all;
  function clearOld() {
    // Hora del servidor del aviso más reciente: los que se envíen después siempre aparecen.
    const cut = all.reduce<string | null>((a, n) => (!a || +new Date(n.createdAt) > +new Date(a) ? n.createdAt : a), null);
    if (!cut || !window.confirm("¿Limpiar la lista de avisos enviados? Solo dejan de verse aquí: no se borran y los seguidores los conservan.")) return;
    try { localStorage.setItem(clearKey, cut); } catch { /* sin almacenamiento: dura hasta salir de la pantalla */ }
    setClearedAt(cut);
  }
  function showOld() {
    try { localStorage.removeItem(clearKey); } catch { /* sin almacenamiento */ }
    setClearedAt(null);
  }
  async function send(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setOk(null);
    try {
      const r = await post<{ recipientCount: number }>("/organization/notifications", f);
      setOk(`Aviso enviado a ${r.recipientCount} ${r.recipientCount === 1 ? "seguidor" : "seguidores"}.`); setF({ title: "", body: "" }); await list.reload();
    } catch (e2) { setErr(e2 instanceof ApiError ? (e2.details?.map((d) => d.message).join(". ") || e2.message) : "No se pudo enviar."); } finally { setBusy(false); }
  }
  return (
    <section className="card stack-sm">
      <h2>Avisos a los seguidores</h2>
      <p className="muted small" style={{ margin: 0 }}>La parroquia tiene <b>{followers}</b> {followers === 1 ? "seguidor" : "seguidores"}. El aviso llega a la bandeja «Avisos» de su cuenta. Al publicar un evento público se avisa automáticamente.</p>
      {ok && <div className="alert ok" role="status">{ok}</div>}
      <ErrorBox msg={err} />
      <form onSubmit={send} noValidate className="stack-sm">
        <div className="field"><label htmlFor="nt-t">Título</label><input id="nt-t" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="field"><label htmlFor="nt-b">Mensaje</label><textarea id="nt-b" value={f.body} maxLength={2000} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <button className="btn btn-primary" disabled={busy || f.title.trim().length < 3 || f.body.trim().length < 3}><Send size={18} /> {busy ? "Enviando…" : "Enviar a todos los seguidores"}</button>
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
            <div className="row"><b style={{ overflowWrap: "anywhere" }}>{n.title}</b><span className="pill gray">{n.kind === "EVENT_PUBLISHED" ? "Automático" : "Manual"}</span></div>
            <div className="muted small">{fmtDateTimeMedium(n.createdAt, viewerTimeZone())} · {n.recipientCount} destinatarios · {n.readCount} lo leyeron</div>
          </div>
        ))}
      </>}
    </section>
  );
}
