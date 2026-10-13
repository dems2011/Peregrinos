"use client";
import { useState, type FormEvent } from "react";
import { Eye, Pencil, Send, Trash2 } from "lucide-react";
import { api, del, post, put } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useLoad } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Modal, Page } from "@/components/ui";

interface Bulletin { id: string; title: string; weekOf: string; body: string; includeSchedule: boolean; includeEvents: boolean; includeCampaigns: boolean; status: "DRAFT" | "PUBLISHED"; publishedAt: string | null; emailedAt: string | null; emailCount: number }
const today = () => new Date().toISOString().slice(0, 10);
const empty = { title: "", weekOf: today(), body: "", includeSchedule: true, includeEvents: true, includeCampaigns: false };

/**
 * B5 — Boletín parroquial (permiso notice:send). No es otro sistema de avisos: al publicarlo llega a los seguidores por
 * los avisos de siempre (bandeja + push) y, a quien lo pidió, por correo. Reúne el texto con la agenda, los eventos y
 * las campañas que la parroquia ya publica.
 */
export default function Boletin() {
  const { can } = useApp();
  const list = useLoad(() => api<{ items: Bulletin[]; emailSubscribers: number }>("/organization/bulletins"), []);
  const [f, setF] = useState(empty); const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ b: Bulletin; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can("notice:send")) return <Page title="Boletín parroquial" back="/configuracion"><div className="alert warn">No tienes permiso para publicar el boletín.</div></Page>;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setErr(null); setOk(null);
    try { await fn(); setOk(done); await list.reload(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); window.scrollTo(0, 0); }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => { if (editing) await put(`/organization/bulletins/${editing}`, f); else await post("/organization/bulletins", f); setF({ ...empty, weekOf: today() }); setEditing(null); }, "Borrador guardado.");
  };
  const subs = list.data?.emailSubscribers ?? 0;

  return (
    <Page title="Boletín parroquial" back="/configuracion">
      <ErrorBox msg={err ?? list.error} />
      {ok && <div className="alert ok" role="status">{ok}</div>}
      <form className="card stack-sm" onSubmit={save}>
        <h2>{editing ? "Editar borrador" : "Nuevo boletín"}</h2>
        <div className="field"><label htmlFor="bt">Título</label><input id="bt" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Boletín de la semana" /></div>
        <div className="field"><label htmlFor="bw">Semana del</label><input id="bw" type="date" value={f.weekOf} onChange={(e) => setF({ ...f, weekOf: e.target.value })} /></div>
        <div className="field"><label htmlFor="bb">Mensaje (anuncios, reflexión, contenido pastoral)</label><textarea id="bb" rows={8} value={f.body} maxLength={8000} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <fieldset className="perm-group"><legend>Agregar automáticamente</legend>
          <label className="check"><input type="checkbox" checked={f.includeSchedule} onChange={(e) => setF({ ...f, includeSchedule: e.target.checked })} /> Horarios de la agenda pastoral</label>
          <label className="check"><input type="checkbox" checked={f.includeEvents} onChange={(e) => setF({ ...f, includeEvents: e.target.checked })} /> Próximos eventos públicos</label>
          <label className="check"><input type="checkbox" checked={f.includeCampaigns} onChange={(e) => setF({ ...f, includeCampaigns: e.target.checked })} /> Campañas de donación activas</label>
        </fieldset>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy || f.title.trim().length < 3 || !f.body.trim()}>{editing ? "Guardar borrador" : "Crear borrador"}</button>
          {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setF({ ...empty, weekOf: today() }); }}>Cancelar</button>}
        </div>
      </form>

      <div className="sec-title">Boletines</div>
      <p className="muted small">{subs} {subs === 1 ? "seguidor eligió" : "seguidores eligieron"} recibirlo también por correo (desde «Mis parroquias»).</p>
      {list.loading && !list.data ? <Loading /> : (
        <div className="card flat">
          {!list.data?.items.length && <div className="empty">Todavía no hay boletines.</div>}
          {list.data?.items.map((b) => (
            <div key={b.id} className="list-item" style={{ cursor: "default", flexWrap: "wrap" }}>
              <span className="grow" style={{ minWidth: 180 }}><span className="t">{b.title}</span> <span className={`pill ${b.status === "PUBLISHED" ? "ok" : "warn"}`}>{b.status === "PUBLISHED" ? "Publicado" : "Borrador"}</span><br />
                <span className="s">Semana del {fmtDate(b.weekOf)}{b.publishedAt ? ` · publicado ${fmtDate(b.publishedAt)}` : ""}{b.emailedAt ? ` · ${b.emailCount} correos` : ""}</span></span>
              <div className="btn-row">
                <button className="btn btn-sm" aria-label={`Vista previa de ${b.title}`} onClick={async () => { try { const r = await api<{ text: string }>(`/organization/bulletins/${b.id}/preview`); setPreview({ b, text: r.text }); } catch (e) { setErr(errMsg(e)); } }}><Eye size={16} /></button>
                {b.status === "DRAFT" && <>
                  <button className="btn btn-sm" aria-label={`Editar ${b.title}`} onClick={() => { setEditing(b.id); setF({ title: b.title, weekOf: b.weekOf.slice(0, 10), body: b.body, includeSchedule: b.includeSchedule, includeEvents: b.includeEvents, includeCampaigns: b.includeCampaigns }); window.scrollTo(0, 0); }}><Pencil size={16} /></button>
                  <button className="btn btn-sm" aria-label={`Borrar ${b.title}`} onClick={() => { if (confirm("¿Borrar este borrador?")) void run(() => del(`/organization/bulletins/${b.id}`), "Borrador borrado."); }}><Trash2 size={16} /></button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <Modal title={preview.b.title} onClose={() => setPreview(null)}>
          <div className="ai-text" style={{ maxHeight: "50vh", overflow: "auto" }}>{preview.text}</div>
          {preview.b.status === "DRAFT" && <PublishBox subs={subs} busy={busy} onPublish={(sendEmail) => { const id = preview.b.id; setPreview(null); void run(() => post(`/organization/bulletins/${id}/publish`, { sendEmail }), sendEmail && subs ? `Boletín publicado. Se está enviando por correo a ${subs} ${subs === 1 ? "persona" : "personas"}.` : "Boletín publicado: llegó como aviso a los seguidores."); }} />}
        </Modal>
      )}
    </Page>
  );
}

function PublishBox({ subs, busy, onPublish }: { subs: number; busy: boolean; onPublish: (sendEmail: boolean) => void }) {
  const [email, setEmail] = useState(subs > 0);
  return (
    <div className="stack-sm" style={{ marginTop: 12 }}>
      <label className="check"><input type="checkbox" checked={email} disabled={!subs} onChange={(e) => setEmail(e.target.checked)} /> Enviar también por correo a quienes lo pidieron ({subs})</label>
      <button className="btn btn-primary" disabled={busy} onClick={() => { if (confirm("¿Publicar el boletín? Llegará como aviso a todos los seguidores y no se podrá editar.")) onPublish(email); }}><Send size={18} /> Publicar</button>
    </div>
  );
}
