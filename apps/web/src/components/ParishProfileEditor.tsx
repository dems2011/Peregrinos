"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Download, Trash2, Upload } from "lucide-react";
import { PARISH_IMAGE_SPEC, PARISH_POSTER_SIZES, SIGYP_PROFILE_FIELDS, type ParishPosterSize } from "@peregrinos/shared";
import { ApiError, api, del, download, patch, post, upload } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDateMedium, fmtDateTimeMedium } from "@/lib/format";
import { useApp } from "@/components/AppContext";
import { ParishProfileView } from "@/components/ParishProfileView";
import { copyText, ErrorBox, Loading, Page } from "@/components/ui";
import type { ParishExtras, ParishProfile, PublicEvent } from "@/lib/types";

/**
 * B1 — Perfil público de la parroquia (solo el superadministrador): primero la vista EXACTA de lo que ve un peregrino y
 * debajo la edición (datos, logo e imagen). Es el Inicio del superadministrador; los avisos están en «Aviso» (/avisos).
 */
type Profile = ParishProfile & { status: string };
const FIELDS = [
  ["name", "Nombre de la parroquia", 160], ["address", "Dirección", 240], ["phone", "Teléfono", 40], ["email", "Correo público", 200],
  ["website", "Sitio web (https://…)", 300], ["instagram", "Instagram (@usuario o enlace)", 200], ["facebook", "Facebook", 200],
  ["youtube", "YouTube", 200], ["tiktok", "TikTok", 200], ["officeHours", "Horarios de atención y celebraciones", 1000],
] as const;
const SIGYP_MANAGED = new Set<string>(SIGYP_PROFILE_FIELDS);
type Key = (typeof FIELDS)[number][0] | "description";

export function ParishProfileEditor({ back }: { back?: string }) {
  const { me, can } = useApp();
  // B5: perfil de la parroquia = permiso parish:profile (SUPERADMIN o colaborador autorizado).
  const sa = can("parish:profile");
  const prof = useLoad(() => api<{ profile: Profile }>("/organization/profile"), []);
  const pub = useLoad(() => api<{ events: PublicEvent[] } & ParishExtras>(`/public/parishes/${me.user.organizationId}`)
    .catch(() => ({ events: [] as PublicEvent[], livestream: null, schedule: [], campaigns: [], bulletins: [], announcements: [] } as { events: PublicEvent[] } & ParishExtras)), []);
  const [f, setF] = useState<Record<Key, string>>({} as Record<Key, string>);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = prof.data?.profile;
  const managed = p?.profileSource === "SIGYP";
  useEffect(() => { if (p) setF(Object.fromEntries([...FIELDS.map(([k]) => [k, (p[k] as string | null) ?? ""]), ["description", p.description ?? ""]]) as Record<Key, string>); }, [p]);

  if (!sa) return <Page title="Perfil de la parroquia" back={back}><div className="alert warn">No tienes permiso para editar el perfil de la parroquia.</div></Page>;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setErr(null); setOk(null);
    try { await fn(); setOk(done); await prof.reload(); await pub.reload(); }
    catch (e) { setErr(e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : "No se pudo completar."); } finally { setBusy(false); window.scrollTo(0, 0); }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    // SIGyP: los campos que publica SIGyP no se envían mientras los administre SIGyP (la API también lo rechaza).
    const body = Object.fromEntries(Object.entries(f).filter(([k]) => !(managed && SIGYP_MANAGED.has(k))).map(([k, v]) => [k, k === "name" ? v.trim() : v.trim() || null]));
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
    <Page title="Perfil de la parroquia" back={back}>
      <ErrorBox msg={err ?? prof.error} />
      {ok && <div className="alert ok" role="status">{ok}</div>}
      {!p ? <Loading /> : <>
        {p.status !== "APPROVED" && <div className="alert warn">La parroquia todavía no está aprobada: su perfil no es público hasta que la plataforma la apruebe.</div>}
        <section className="stack-sm">
          <h2 style={{ margin: "8px 0 0" }}>Así ve tu parroquia un peregrino</h2>
          <ParishProfileView preview parish={p} events={pub.data?.events ?? []} extras={pub.data ?? null} action={<span className="btn btn-primary" aria-disabled="true">Seguir</span>} />
        </section>

        <PosterCard code={p.code} id={p.id} approved={p.status === "APPROVED"} busy={busy}
          onDownload={(size) => void run(() => download(`/organization/poster.pdf?size=${size}`, `cartel-${p.code}-${size}.pdf`), `Cartel ${size} descargado.`)} />

        <h2 style={{ margin: "16px 0 0" }}>Editar el perfil</h2>
        <form className="card" onSubmit={save} noValidate>
          <h2>Información pública</h2>
          {managed && <div className="alert warn" role="note">La descripción, los datos de contacto, los canales y los horarios se administran desde SIGyP (Gestión Parroquial){p?.profileSyncedAt ? ` · última actualización ${fmtDateTimeMedium(p.profileSyncedAt)}` : ""}. Aquí solo puedes cambiar el nombre, el logo y la imagen.</div>}
          {FIELDS.map(([k, label, max]) => (
            <div className="field" key={k}><label htmlFor={`pf-${k}`}>{label}</label>{k === "officeHours"
              ? <textarea id={`pf-${k}`} value={f[k] ?? ""} maxLength={max} disabled={managed} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              : <input id={`pf-${k}`} value={f[k] ?? ""} maxLength={max} disabled={managed && SIGYP_MANAGED.has(k)} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</div>
          ))}
          <div className="field"><label htmlFor="pf-d">Descripción</label><textarea id="pf-d" value={f.description ?? ""} maxLength={2000} disabled={managed} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Quiénes son, horarios de misa, cómo participar…" /></div>
          <button className="btn btn-primary" disabled={busy || (f.name ?? "").trim().length < 3}>{busy ? "Guardando…" : "Guardar perfil"}</button>
        </form>

        <SigypCard onChanged={() => void prof.reload()} />
        <ImageCard title="Logo" kind="logo" url={p.logoUrl} busy={busy} onPick={sendImage} onRemove={() => void run(() => del("/organization/media/logo"), "Logo quitado.")}
          hint={`Cuadrado (proporción ${PARISH_IMAGE_SPEC.logo.minRatio}–${PARISH_IMAGE_SPEC.logo.maxRatio}), mínimo ${PARISH_IMAGE_SPEC.logo.minPx} × ${PARISH_IMAGE_SPEC.logo.minPx} px, PNG/JPEG/WEBP, hasta 1 MB. Se muestra en un círculo.`} />
        <ImageCard title="Imagen de la parroquia" kind="cover" url={p.coverUrl} busy={busy} onPick={sendImage} onRemove={() => void run(() => del("/organization/media/cover"), "Imagen quitada.")}
          hint={`Horizontal (recomendado 1600 × 900 px, proporción ${PARISH_IMAGE_SPEC.cover.minRatio}–${PARISH_IMAGE_SPEC.cover.maxRatio}), mínimo ${PARISH_IMAGE_SPEC.cover.minWidth} × ${PARISH_IMAGE_SPEC.cover.minHeight} px, PNG/JPEG/WEBP, hasta 2 MB.`} />
      </>}
    </Page>
  );
}

/**
 * B4 — Código institucional (permanente, lo asigna el sistema) y cartel imprimible con el QR del perfil de la parroquia.
 * El QR abre /parroquias?codigo=…, que lleva al perfil exacto. Solo con la parroquia aprobada (antes el perfil no es público).
 */
function PosterCard({ code, id, approved, busy, onDownload }: { code: string; id: string; approved: boolean; busy: boolean; onDownload: (size: ParishPosterSize) => void }) {
  return (
    <section className="card stack-sm">
      <h2>Código y cartel de la parroquia</h2>
      <p style={{ margin: 0 }}>Código: <strong style={{ fontSize: 20, letterSpacing: 1 }}>{code}</strong> <button type="button" className="btn btn-sm" onClick={() => copyText(code)}><Copy size={16} /> Copiar</button></p>
      <p className="muted small" style={{ margin: 0 }}>Es único y no cambia aunque cambies el nombre, el logo o la dirección. Los fieles lo escriben en «Buscar mi parroquia» para encontrarla sin confundirla con otra. No da ningún permiso.</p>
      {approved ? <>
        <img src={`/api/public/parishes/${id}/qr.svg`} alt={`Código QR de la parroquia ${code}`} width={160} height={160} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
        <p className="muted small" style={{ margin: 0 }}>Cartel listo para imprimir con el logo, el nombre, este código y el QR que abre el perfil de la parroquia.</p>
        <div className="btn-row">
          {PARISH_POSTER_SIZES.map((s) => <button key={s} type="button" className="btn" disabled={busy} onClick={() => onDownload(s)}><Download size={18} /> Cartel {s} (PDF)</button>)}
        </div>
      </> : <p className="muted small" style={{ margin: 0 }}>El QR y el cartel estarán disponibles cuando la parroquia esté aprobada.</p>}
    </section>
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

interface SigypClientRow { id: string; label: string; tokenHint: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }

/**
 * SIGyP (Gestión Parroquial): credencial para que SIGyP publique la cartelera y el perfil de ESTA parroquia. Se muestra
 * una sola vez al crearla; se pega en SIGyP («Perfil parroquial → Vinculación con Peregrinos»). Revocar corta de inmediato.
 */
function SigypCard({ onChanged }: { onChanged: () => void }) {
  const data = useLoad(() => api<{ organizationId: string; profileSource: string | null; items: SigypClientRow[] }>("/organization/integrations/sigyp"), []);
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); await data.reload(); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo completar."); } finally { setBusy(false); }
  };
  const active = data.data?.items.filter((i) => !i.revokedAt) ?? [];
  return (
    <section className="card stack-sm" data-testid="sigyp-card">
      <h2>Conexión con SIGyP (Gestión Parroquial)</h2>
      <p className="muted small" style={{ margin: 0 }}>Permite que el sistema de gestión de la parroquia publique aquí su cartelera y sus datos públicos. Solo envía lo que la parroquia publica; no da acceso a nada más de Peregrinos.</p>
      <ErrorBox msg={err ?? data.error} />
      {data.data && <p className="small" style={{ margin: 0 }}>Identificador de la organización: <code>{data.data.organizationId}</code> <button type="button" className="btn btn-sm" onClick={() => copyText(data.data!.organizationId)}><Copy size={16} /> Copiar</button></p>}
      {token && (
        <div className="alert ok" role="status">
          <p style={{ margin: 0 }}>Credencial creada. Cópiala ahora: <b>no se volverá a mostrar</b>.</p>
          <p style={{ margin: "6px 0", overflowWrap: "anywhere" }}><code>{token}</code></p>
          <button type="button" className="btn btn-sm" onClick={() => copyText(token)}><Copy size={16} /> Copiar credencial</button>
        </div>
      )}
      {active.map((c) => (
        <p key={c.id} className="small" style={{ margin: 0 }}>
          {c.label} · credencial {c.tokenHint} · creada {fmtDateMedium(c.createdAt)} · {c.lastUsedAt ? `último uso ${fmtDateTimeMedium(c.lastUsedAt)}` : "sin usar"}{" "}
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void act(() => post(`/organization/integrations/sigyp/${c.id}/revoke`, {}))}>Revocar</button>
        </p>
      ))}
      <div className="btn-row">
        <button type="button" className="btn" disabled={busy} onClick={() => void act(async () => { const r = await post<{ token: string }>("/organization/integrations/sigyp", { label: "SIGyP" }); setToken(r.token); })}>Crear credencial</button>
        {data.data?.profileSource === "SIGYP" && <button type="button" className="btn" disabled={busy} onClick={() => void act(() => post("/organization/integrations/sigyp/release-profile", {}))}>Volver a editar el perfil aquí</button>}
      </div>
    </section>
  );
}
