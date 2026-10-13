"use client";
import { useState, type FormEvent } from "react";
import { ExternalLink, Megaphone, Play, Square, Trash2 } from "lucide-react";
import { LIVESTREAM_STATUS_LABEL } from "@peregrinos/shared";
import { api, del, post } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useLoad } from "@/lib/hooks";
import { fmtDateTimeMedium, fromZonedInput } from "@/lib/format";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";

interface Stream {
  id: string; title: string; videoId: string; watchUrl: string; status: "SCHEDULED" | "LIVE" | "ENDED"; statusSource: "MANUAL" | "YOUTUBE_API"; verified: boolean;
  scheduledAt: string | null; startedAt: string | null; endedAt: string | null; announcedAt: string | null; eventId: string | null;
}

/**
 * B5 — Transmisiones en vivo (permiso stream:manage). El video y el chat viven en YouTube (sin costo de streaming propio).
 * EN VIVO nunca se deduce de la URL: lo marca la parroquia («Iniciar») o lo confirma YouTube si la API está configurada.
 */
export default function Transmisiones() {
  const { can } = useApp();
  const list = useLoad(() => api<{ items: Stream[] }>("/organization/livestreams"), []);
  const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [when, setWhen] = useState("");
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can("stream:manage")) return <Page title="Transmisiones en vivo" back="/configuracion"><div className="alert warn">No tienes permiso para gestionar transmisiones.</div></Page>;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setErr(null); setOk(null);
    try { await fn(); setOk(done); await list.reload(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => { await post("/organization/livestreams", { title, url, scheduledAt: when ? fromZonedInput(when) : null }); setTitle(""); setUrl(""); setWhen(""); }, "Transmisión cargada. Aparece en el perfil como «Programada» hasta que la inicies.");
  };

  return (
    <Page title="Transmisiones en vivo" back="/configuracion">
      <ErrorBox msg={err ?? list.error} />
      {ok && <div className="alert ok" role="status">{ok}</div>}
      <form className="card stack-sm" onSubmit={create}>
        <h2>Nueva transmisión</h2>
        <p className="muted small" style={{ margin: 0 }}>Programa la transmisión en tu canal de YouTube y pega aquí su enlace. Peregrinos la muestra en el perfil de la parroquia con el reproductor y el chat de YouTube.</p>
        <div className="field"><label htmlFor="lt">Título</label><input id="lt" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Misa dominical" /></div>
        <div className="field"><label htmlFor="lu">Enlace de YouTube</label><input id="lu" inputMode="url" value={url} maxLength={300} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/live/…" /></div>
        <div className="field"><label htmlFor="lw">Fecha y hora (opcional)</label><input id="lw" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={busy || title.trim().length < 3 || url.trim().length < 5}>Guardar transmisión</button>
      </form>

      <div className="sec-title">Transmisiones</div>
      {list.loading && !list.data ? <Loading /> : (
        <div className="card flat">
          {!list.data?.items.length && <div className="empty">Todavía no cargaste transmisiones.</div>}
          {list.data?.items.map((s) => (
            <div key={s.id} className="list-item" style={{ cursor: "default", flexWrap: "wrap" }}>
              <span className="grow" style={{ minWidth: 200 }}>
                <span className="t">{s.title}</span>{" "}
                <span className={`pill ${s.status === "LIVE" ? "err" : s.status === "ENDED" ? "gray" : "warn"}`}>{LIVESTREAM_STATUS_LABEL[s.status]}</span><br />
                <span className="s">
                  {s.scheduledAt ? `${fmtDateTimeMedium(s.scheduledAt)} · ` : ""}
                  {s.verified ? "Estado verificado con YouTube" : "Estado marcado por la parroquia"}
                  {s.announcedAt ? " · Seguidores invitados" : ""}
                </span>
              </span>
              <div className="btn-row">
                <a className="btn btn-sm" href={s.watchUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> YouTube</a>
                {s.status === "SCHEDULED" && <button className="btn btn-sm btn-ok" disabled={busy} onClick={() => void run(() => post(`/organization/livestreams/${s.id}/start`), "La transmisión figura EN VIVO en el perfil.")}><Play size={16} /> Iniciar</button>}
                {s.status === "LIVE" && <button className="btn btn-sm" disabled={busy} onClick={() => void run(() => post(`/organization/livestreams/${s.id}/end`), "Transmisión finalizada.")}><Square size={16} /> Finalizar</button>}
                {s.status !== "ENDED" && !s.announcedAt && <button className="btn btn-sm" disabled={busy} onClick={() => { if (confirm("¿Avisar a todos los seguidores de la parroquia? Se envía una sola vez.")) void run(() => post(`/organization/livestreams/${s.id}/announce`), "Invitación enviada a los seguidores."); }}><Megaphone size={16} /> Invitar a los seguidores</button>}
                {s.status !== "LIVE" && <button className="btn btn-sm" aria-label={`Quitar ${s.title}`} disabled={busy} onClick={() => { if (confirm("¿Quitar esta transmisión de Peregrinos? El video de YouTube no se toca.")) void run(() => del(`/organization/livestreams/${s.id}`), "Transmisión quitada."); }}><Trash2 size={16} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted small">Con una clave de YouTube Data API configurada en el servidor, el estado (programada, en vivo, finalizada) se verifica automáticamente con YouTube.</p>
    </Page>
  );
}
