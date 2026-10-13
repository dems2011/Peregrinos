"use client";
import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { api, ApiError, patch } from "@/lib/api";
import { useLoad } from "@/lib/hooks";

/** B1 — Parroquias que sigue la cuenta (y acceso al buscador). B5: por cada una, recibir el boletín también por correo. */
interface Followed { id: string; code: string; name: string; address: string | null; logoUrl: string | null; bulletinEmail: boolean }

export default function MisParroquias() {
  const list = useLoad(() => api<{ items: Followed[] }>("/auth/account/follows"), []);
  // Valor confirmado por la API (sobrescribe el de la lista) y parroquia que se está guardando.
  const [pref, setPref] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function setBulletinEmail(p: Followed, value: boolean) {
    setBusy(p.id); setErr(null);
    try {
      const r = await patch<{ bulletinEmail: boolean }>(`/auth/account/follows/${p.id}`, { bulletinEmail: value });
      setPref((s) => ({ ...s, [p.id]: r.bulletinEmail }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "No se pudo guardar la preferencia.");
    } finally { setBusy(null); }
  }

  return (
    <>
      <Link className="btn btn-primary" href="/parroquias"><Search size={18} /> Buscar parroquias</Link>
      {err && <div className="alert err" role="alert">{err}</div>}
      <section className="card flat">
        {!list.data && <div className="acct-loading" style={{ color: "inherit" }}>{list.error ?? "Cargando…"}</div>}
        {list.data && !list.data.items.length && <div className="empty">Todavía no sigues ninguna parroquia.</div>}
        {list.data?.items.map((p) => {
          const email = pref[p.id] ?? p.bulletinEmail;
          return (
            <div key={p.id} className="follow-item">
              <Link href={`/parroquias/${p.id}`} className="list-item">
                {p.logoUrl ? <img className="parish-logo" style={{ width: 44, height: 44, flexBasis: 44 }} src={p.logoUrl} alt="" /> : <span className="parish-logo placeholder" style={{ width: 44, height: 44, flexBasis: 44, fontSize: 18 }} aria-hidden="true">{p.name.charAt(0)}</span>}
                <span className="grow"><span className="t">{p.name}</span><br /><span className="s">{[p.code, p.address].filter(Boolean).join(" · ")}</span></span>
              </Link>
              <label className="check follow-pref">
                <input type="checkbox" checked={email} disabled={busy === p.id} onChange={(e) => void setBulletinEmail(p, e.target.checked)} />
                {" "}Recibir el boletín parroquial también por correo
              </label>
            </div>
          );
        })}
      </section>
    </>
  );
}
