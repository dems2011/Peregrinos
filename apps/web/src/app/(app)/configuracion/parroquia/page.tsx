"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Trash2, Upload } from "lucide-react";
import { PARISH_IMAGE_SPEC } from "@peregrinos/shared";
import { ApiError, api, del, patch, post, upload } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useApp } from "@/components/AppContext";
import { ParishProfileView } from "@/components/ParishProfileView";
import { ErrorBox, Loading, Page } from "@/components/ui";
import { fmtDateTimeMedium, viewerTimeZone } from "@/lib/format";
import type { ParishProfile, PublicEvent } from "@/lib/types";

/**
 * B1 — Perfil público de la parroquia (solo el superadministrador): datos, logo e imagen, vista previa EXACTA de lo
 * que ve un peregrino y avisos a todos los seguidores.
 */
type Profile = ParishProfile & { status: string };
const FIELDS = [
  ["name", "Nombre de la parroquia", 160], ["address", "Dirección", 240], ["phone", "Teléfono", 40], ["email", "Correo público", 200],
  ["website", "Sitio web (https://…)", 300], ["instagram", "Instagram (@usuario o enlace)", 200], ["facebook", "Facebook", 200],
  ["youtube", "YouTube", 200], ["tiktok", "TikTok", 200],
] as const;
type Key = (typeof FIELDS)[number][0] | "description";

export default function PerfilParroquia() {
  const { me } = useApp();
  const sa = me.user.role === "SUPERADMIN";
  const prof = useLoad(() => api<{ profile: Profile }>("/organization/profile"), []);
  const pub = useLoad(() => api<{ events: PublicEvent[] }>(`/public/parishes/${me.user.organizationId}`).catch(() => ({ events: [] as PublicEvent[] })), []);
  const [f, setF] = useState<Record<Key, string>>({} as Record<Key, string>);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = prof.data?.profile;
  useEffect(() => { if (p) setF(Object.fromEntries([...FIELDS.map(([k]) => [k, (p[k] as string | null) ?? ""]), ["description", p.description ?? ""]]) as Record<Key, string>); }, [p]);

  if (!sa) return <Page title="Perfil de la parroquia" back="/configuracion"><div className="alert warn">Solo el superadministrador puede editar el perfil de la parroquia.</div></Page>;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setErr(null); setOk(null);
    try { await fn(); setOk(done); await prof.reload(); await pub.reload(); }
    catch (e) { setErr(e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : "No se pudo completar."); } finally { setBusy(false); window.scrollTo(0, 0); }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, k === "name" ? v.trim() : v.trim() || null]));
    void run(() => patch("/organization/profile", body), "Perfil guardado.");
  };
  const sendImage = (kind: "logo" | "cover", file?: File) => {
    if (!file) return;
    const max = PARISH_IMAGE_SPEC[kind].maxBytes;
    if (file.size > max) { setErr(`La imagen pesa ${(file.size / 1048576).toFixed(1)} MB; el máximo es ${max / 1048576} MB.`); return; }
    const form = new FormData(); form.append("file", file);
    void run(() => upload(`/organization/media/${kind}`, form, "PUT"), kind === "logo" ? "Logo actualizado." : "Imagen actualizada.");
  };

  return (
    <Page title="Perfil de la parroquia" back="/configuracion">
      <ErrorBox msg={err ?? prof.error} />
      {ok && <div className="alert ok" role="status">{ok}</div>}
      {!p ? <Loading /> : <>
        {p.status !== "APPROVED" && <div className="alert warn">La parroquia todavía no está aprobada: su perfil no es público hasta que la plataforma la apruebe.</div>}
        <form className="card" onSubmit={save} noValidate>
          <h2>Información pública</h2>
          {FIELDS.map(([k, label, max]) => (
            <div className="field" key={k}><label htmlFor={`pf-${k}`}>{label}</label><input id={`pf-${k}`} value={f[k] ?? ""} maxLength={max} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
          ))}
          <div className="field"><label htmlFor="pf-d">Descripción</label><textarea id="pf-d" value={f.description ?? ""} maxLength={2000} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Quiénes son, horarios de misa, cómo participar…" /></div>
          <button className="btn btn-primary" disabled={busy || (f.name ?? "").trim().length < 3}>{busy ? "Guardando…" : "Guardar perfil"}</button>
        </form>

        <ImageCard title="Logo" kind="logo" url={p.logoUrl} busy={busy} onPick={sendImage} onRemove={() => void run(() => del("/organization/media/logo"), "Logo quitado.")}
          hint={`Cuadrado (proporción ${PARISH_IMAGE_SPEC.logo.minRatio}–${PARISH_IMAGE_SPEC.logo.maxRatio}), mínimo ${PARISH_IMAGE_SPEC.logo.minPx} × ${PARISH_IMAGE_SPEC.logo.minPx} px, PNG/JPEG/WEBP, hasta 1 MB. Se muestra en un círculo.`} />
        <ImageCard title="Imagen de la parroquia" kind="cover" url={p.coverUrl} busy={busy} onPick={sendImage} onRemove={() => void run(() => del("/organization/media/cover"), "Imagen quitada.")}
          hint={`Horizontal (recomendado 1600 × 900 px, proporción ${PARISH_IMAGE_SPEC.cover.minRatio}–${PARISH_IMAGE_SPEC.cover.maxRatio}), mínimo ${PARISH_IMAGE_SPEC.cover.minWidth} × ${PARISH_IMAGE_SPEC.cover.minHeight} px, PNG/JPEG/WEBP, hasta 2 MB.`} />

        <Notifications followers={p.followerCount} />

        <section className="stack-sm">
          <h2 style={{ margin: "8px 0 0" }}>Vista previa (así la ve un peregrino)</h2>
          <ParishProfileView preview parish={p} events={pub.data?.events ?? []} action={<span className="btn btn-primary" aria-disabled="true">Seguir</span>} />
        </section>
      </>}
    </Page>
  );
}

function ImageCard({ title, kind, url, hint, busy, onPick, onRemove }: { title: string; kind: "logo" | "cover"; url: string | null; hint: string; busy: boolean; onPick: (k: "logo" | "cover", f?: File) => void; onRemove: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <section className="card stack-sm">
      <h2>{title}</h2>
      {url ? <img src={url} alt={title} style={kind === "logo" ? { width: 96, height: 96, borderRadius: "50%", objectFit: "cover" } : { width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 10 }} />
        : <p className="muted small">Sin {title.toLowerCase()} todavía.</p>}
      <p className="muted small" style={{ margin: 0 }}>{hint}</p>
      <input ref={ref} id={`img-${kind}`} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { onPick(kind, e.target.files?.[0]); if (ref.current) ref.current.value = ""; }} />
      <div className="btn-row">
        <label htmlFor={`img-${kind}`} className="btn" aria-disabled={busy}><Upload size={18} /> {url ? "Reemplazar" : "Subir"}</label>
        {url && <button type="button" className="btn" disabled={busy} onClick={onRemove}><Trash2 size={18} /> Quitar</button>}
      </div>
    </section>
  );
}

interface Sent { id: string; kind: "MANUAL" | "EVENT_PUBLISHED"; title: string; body: string; recipientCount: number; readCount: number; createdAt: string; event: { name: string } | null }

function Notifications({ followers }: { followers: number }) {
  const list = useLoad(() => api<{ items: Sent[] }>("/organization/notifications"), []);
  const [f, setF] = useState({ title: "", body: "" });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      {!!list.data?.items.length && <>
        <h3 style={{ margin: "8px 0 0" }}>Enviados</h3>
        {list.data.items.map((n) => (
          <div key={n.id} className="acct-item">
            <div className="row"><b style={{ overflowWrap: "anywhere" }}>{n.title}</b><span className="pill gray">{n.kind === "EVENT_PUBLISHED" ? "Automático" : "Manual"}</span></div>
            <div className="muted small">{fmtDateTimeMedium(n.createdAt, viewerTimeZone())} · {n.recipientCount} destinatarios · {n.readCount} lo leyeron</div>
          </div>
        ))}
      </>}
    </section>
  );
}
