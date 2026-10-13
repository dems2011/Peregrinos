"use client";
import { useRef, useState, type FormEvent } from "react";
import { HeartHandshake, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { DONATION_PURPOSES, DONATION_PURPOSE_LABEL, isAllowedDonationUrl, type DonationPurpose } from "@peregrinos/shared";
import { api, del, post, put, upload } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useLoad } from "@/lib/hooks";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";

interface Img { large: string | null; medium: string | null; small: string | null }
interface Campaign { id: string; title: string; purpose: DonationPurpose; description: string | null; beneficiary: string; url: string; active: boolean; sortOrder: number; image: Img | null }
const empty = { title: "", purpose: "MAINTENANCE" as DonationPurpose, description: "", beneficiary: "", url: "", active: false };

/**
 * B5 — Donaciones (permiso donation:manage). Primera versión: enlace de pago EXTERNO de Mercado Pago de la cuenta de la
 * parroquia. Peregrinos no cobra, no ve tarjetas ni confirma pagos: el botón abre Mercado Pago y el pago se completa allí.
 */
export default function Donaciones() {
  const { can } = useApp();
  const list = useLoad(() => api<{ items: Campaign[] }>("/organization/donations"), []);
  const [f, setF] = useState(empty); const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can("donation:manage")) return <Page title="Donaciones" back="/configuracion"><div className="alert warn">No tienes permiso para gestionar las donaciones.</div></Page>;
  const urlOk = isAllowedDonationUrl(f.url);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setErr(null); setOk(null);
    try { await fn(); setOk(done); await list.reload(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); window.scrollTo(0, 0); }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    const body = { ...f, description: f.description || null };
    void run(async () => { if (editing) await put(`/organization/donations/${editing}`, body); else await post("/organization/donations", body); setF(empty); setEditing(null); }, editing ? "Campaña actualizada." : "Campaña creada.");
  };

  return (
    <Page title="Donaciones" back="/configuracion">
      <ErrorBox msg={err ?? list.error} />
      {ok && <div className="alert ok" role="status">{ok}</div>}
      <div className="alert">Cada campaña usa un <b>enlace de pago de Mercado Pago de la cuenta de la parroquia</b>. Peregrinos no recibe el dinero, no guarda datos de tarjetas y no confirma los pagos: verifícalos en tu cuenta de Mercado Pago. Mercado Pago cobra sus propias comisiones según la cuenta y el medio de pago.</div>

      <form className="card stack-sm" onSubmit={save}>
        <h2>{editing ? "Editar campaña" : "Nueva campaña"}</h2>
        <div className="field"><label htmlFor="dt">Nombre de la campaña</label><input id="dt" value={f.title} maxLength={100} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Mantenimiento del templo" /></div>
        <div className="field"><label htmlFor="dp">Finalidad</label><select id="dp" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value as DonationPurpose })}>{DONATION_PURPOSES.map((p) => <option key={p} value={p}>{DONATION_PURPOSE_LABEL[p]}</option>)}</select></div>
        <div className="field"><label htmlFor="dd">Descripción (opcional)</label><textarea id="dd" value={f.description} maxLength={1000} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Para qué se usará lo recaudado" /></div>
        <div className="field"><label htmlFor="db">Beneficiario</label><input id="db" value={f.beneficiary} maxLength={160} onChange={(e) => setF({ ...f, beneficiary: e.target.value })} placeholder="Parroquia … (titular de la cuenta de Mercado Pago)" /></div>
        <div className="field"><label htmlFor="du">Enlace de pago de Mercado Pago</label><input id="du" inputMode="url" value={f.url} maxLength={500} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://mpago.la/…" aria-invalid={!!f.url && !urlOk} />
          {f.url && !urlOk && <span className="small" style={{ color: "var(--err)" }}>Usa un enlace https de Mercado Pago (mpago.la, link.mercadopago.com.ar…).</span>}</div>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Mostrar en el perfil de la parroquia</label>
        {f.title && (<>
          <div className="muted small">Vista previa en el perfil:</div>
          <div className="donation-card"><b>{f.title}</b><span className="muted small">{DONATION_PURPOSE_LABEL[f.purpose]}{f.beneficiary ? ` · Beneficiario: ${f.beneficiary}` : ""}</span>{f.description && <span className="small">{f.description}</span>}<span className="btn btn-primary" aria-disabled="true"><HeartHandshake size={18} /> Colaborar</span></div>
        </>)}
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy || f.title.trim().length < 3 || f.beneficiary.trim().length < 3 || !urlOk}>{editing ? "Guardar cambios" : "Crear campaña"}</button>
          {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setF(empty); }}>Cancelar</button>}
        </div>
      </form>

      <div className="sec-title">Campañas</div>
      {list.loading && !list.data ? <Loading /> : (
        <div className="card flat">
          {!list.data?.items.length && <div className="empty">Todavía no hay campañas.</div>}
          {list.data?.items.map((c) => <CampaignRow key={c.id} c={c} busy={busy} run={run} onEdit={() => { setEditing(c.id); setF({ title: c.title, purpose: c.purpose, description: c.description ?? "", beneficiary: c.beneficiary, url: c.url, active: c.active }); window.scrollTo(0, 0); }} />)}
        </div>
      )}
    </Page>
  );
}

function CampaignRow({ c, busy, run, onEdit }: { c: Campaign; busy: boolean; run: (fn: () => Promise<unknown>, done: string) => Promise<void>; onEdit: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="list-item" style={{ cursor: "default", flexWrap: "wrap", opacity: c.active ? 1 : .6 }}>
      {c.image?.small ? <img src={c.image.small} alt="" width={64} height={40} style={{ objectFit: "cover", borderRadius: 8 }} /> : null}
      <span className="grow" style={{ minWidth: 180 }}><span className="t">{c.title}</span> <span className={`pill ${c.active ? "ok" : "gray"}`}>{c.active ? "Visible" : "Oculta"}</span><br />
        <span className="s">{DONATION_PURPOSE_LABEL[c.purpose]} · {new URL(c.url).hostname}</span></span>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Imagen de ${c.title}`} onChange={(e) => {
        const file = e.target.files?.[0]; if (!file) return; const form = new FormData(); form.append("file", file);
        void run(() => upload(`/organization/donations/${c.id}/image`, form, "PUT"), "Imagen actualizada."); if (ref.current) ref.current.value = "";
      }} />
      <div className="btn-row">
        <button className="btn btn-sm" disabled={busy} onClick={() => ref.current?.click()}><ImagePlus size={16} /> Imagen</button>
        <button className="btn btn-sm" disabled={busy} aria-label={`Editar ${c.title}`} onClick={onEdit}><Pencil size={16} /></button>
        <button className="btn btn-sm" disabled={busy} aria-label={`Borrar ${c.title}`} onClick={() => { if (confirm(`¿Borrar la campaña «${c.title}»?`)) void run(() => del(`/organization/donations/${c.id}`), "Campaña borrada."); }}><Trash2 size={16} /></button>
      </div>
    </div>
  );
}
