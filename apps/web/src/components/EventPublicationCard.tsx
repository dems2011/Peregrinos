"use client";
import { useRef, useState } from "react";
import { ImagePlus, MapPinned, Trash2 } from "lucide-react";
import { api, del, put, upload } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useLoad } from "@/lib/hooks";
import type { EventItem } from "@/lib/types";
import { useApp } from "./AppContext";
import { ErrorBox } from "./ui";

interface Cover { large: string | null; medium: string | null; small: string | null }

/**
 * B5 — Publicación del evento (portada, permiso post:manage) y seguimiento GPS en vivo (permiso event:update). La portada
 * es la imagen del evento en el perfil público: no hay otra sección de eventos. El seguimiento es opt-in de cada
 * participante y solo funciona con el evento EN CURSO.
 */
export function EventPublicationCard({ event, onChanged }: { event: EventItem; onChanged: () => Promise<unknown> | void }) {
  const { can } = useApp();
  const cover = useLoad(() => api<{ cover: Cover | null }>(`/events/${event.id}/cover`), [event.id]);
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setErr(null); setOk(null);
    try { await fn(); setOk(done); await cover.reload(); await onChanged(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const img = cover.data?.cover;
  return (
    <section className="card stack-sm">
      <h2>Publicación y seguimiento</h2>
      <ErrorBox msg={err} />
      {ok && <div className="alert ok" role="status">{ok}</div>}
      <h3 style={{ margin: 0 }}>Portada del evento</h3>
      {img?.medium
        ? <img src={img.medium} alt={`Portada de ${event.name}`} style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 12 }} />
        : <p className="muted small" style={{ margin: 0 }}>Sin portada. Se muestra en la publicación del evento en el perfil de la parroquia.</p>}
      <p className="muted small" style={{ margin: 0 }}>Horizontal (recomendado 1600 × 900 px), mínimo 800 × 400 px, PNG, JPEG o WEBP, hasta 5 MB. Se generan versiones livianas para celular, tableta y computadora.</p>
      {can("post:manage") ? (<>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Elegir portada" onChange={(e) => {
          const file = e.target.files?.[0]; if (!file) return;
          if (file.size > 5 * 1024 * 1024) { setErr(`La imagen pesa ${(file.size / 1048576).toFixed(1)} MB; el máximo es 5 MB.`); return; }
          const form = new FormData(); form.append("file", file);
          void run(() => upload(`/events/${event.id}/cover`, form, "PUT"), "Portada actualizada."); if (ref.current) ref.current.value = "";
        }} />
        <div className="btn-row">
          <button type="button" className="btn" disabled={busy} onClick={() => ref.current?.click()}><ImagePlus size={18} /> {img ? "Reemplazar portada" : "Subir portada"}</button>
          {img && <button type="button" className="btn" disabled={busy} onClick={() => void run(() => del(`/events/${event.id}/cover`), "Portada quitada.")}><Trash2 size={18} /> Quitar</button>}
        </div>
      </>) : <p className="muted small" style={{ margin: 0 }}>Para cambiar la portada se necesita el permiso «Publicaciones y fotografías».</p>}

      <h3 style={{ margin: "8px 0 0" }}><MapPinned size={18} style={{ verticalAlign: "-3px" }} /> Seguimiento GPS en vivo</h3>
      <p className="muted small" style={{ margin: 0 }}>Cada participante decide si comparte su ubicación desde su acceso personal. Solo funciona con el evento <b>en curso</b>; al desactivarlo o al finalizar el evento se borran todas las ubicaciones. Las verás en «Mapa y recorrido».</p>
      <label className="check"><input type="checkbox" checked={!!event.trackingEnabled} disabled={busy || !can("event:update")}
        onChange={(e) => {
          const on = e.target.checked;
          if (!on && !confirm("¿Desactivar el seguimiento? Se borrarán las ubicaciones compartidas.")) return;
          void run(() => put(`/events/${event.id}/tracking/settings`, { trackingEnabled: on }), on ? "Seguimiento activado: los participantes ya pueden compartir su ubicación." : "Seguimiento desactivado y ubicaciones borradas.");
        }} /> Permitir que los participantes compartan su ubicación en vivo</label>
    </section>
  );
}
