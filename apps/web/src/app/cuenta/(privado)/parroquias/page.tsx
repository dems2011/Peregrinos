"use client";
import Link from "next/link";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";

/** B1 — Parroquias que sigue la cuenta (y acceso al buscador). */
interface Followed { id: string; name: string; address: string | null; logoUrl: string | null }

export default function MisParroquias() {
  const list = useLoad(() => api<{ items: Followed[] }>("/auth/account/follows"), []);
  return (
    <>
      <Link className="btn btn-primary" href="/parroquias"><Search size={18} /> Buscar parroquias</Link>
      <section className="card flat">
        {!list.data && <div className="acct-loading" style={{ color: "inherit" }}>{list.error ?? "Cargando…"}</div>}
        {list.data && !list.data.items.length && <div className="empty">Todavía no sigues ninguna parroquia.</div>}
        {list.data?.items.map((p) => (
          <Link key={p.id} href={`/parroquias/${p.id}`} className="list-item">
            {p.logoUrl ? <img className="parish-logo" style={{ width: 44, height: 44, flexBasis: 44 }} src={p.logoUrl} alt="" /> : <span className="parish-logo placeholder" style={{ width: 44, height: 44, flexBasis: 44, fontSize: 18 }} aria-hidden="true">{p.name.charAt(0)}</span>}
            <span className="grow"><span className="t">{p.name}</span>{p.address && <><br /><span className="s">{p.address}</span></>}</span>
          </Link>
        ))}
      </section>
    </>
  );
}
