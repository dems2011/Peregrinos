"use client";
import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounced, useLoad } from "@/lib/hooks";
import { PublicShell } from "@/components/PublicShell";

/** B1 — Buscador público de parroquias (solo las aprobadas). */
interface Item { id: string; name: string; address: string | null; description: string | null; followerCount: number; publicEvents: number; logoUrl: string | null }

export default function Parroquias() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 300);
  const list = useLoad(() => api<{ items: Item[] }>(`/public/parishes${dq ? `?q=${encodeURIComponent(dq)}` : ""}`), [dq]);
  return (
    <PublicShell subtitle="Parroquias">
      <section className="card stack-sm">
        <h1 className="acct-title" style={{ margin: 0 }}>Buscar una parroquia</h1>
        <p className="muted" style={{ margin: 0 }}>Encuentra tu parroquia, síguela para recibir sus avisos e inscríbete en sus eventos.</p>
        <div className="search"><Search size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o ciudad" aria-label="Buscar parroquia" /></div>
      </section>
      <section className="card flat">
        {list.loading && !list.data && <div className="spinner" role="status" aria-label="Cargando" />}
        {list.error && <div className="alert err" role="alert">{list.error}</div>}
        {list.data && !list.data.items.length && <div className="empty">{dq ? "Ninguna parroquia coincide con la búsqueda." : "Todavía no hay parroquias publicadas."}</div>}
        {list.data?.items.map((p) => (
          <Link key={p.id} href={`/parroquias/${p.id}`} className="list-item">
            {p.logoUrl ? <img className="parish-logo" style={{ width: 48, height: 48, flexBasis: 48 }} src={p.logoUrl} alt="" /> : <span className="parish-logo placeholder" style={{ width: 48, height: 48, flexBasis: 48, fontSize: 20 }} aria-hidden="true">{p.name.charAt(0)}</span>}
            <span className="grow"><span className="t">{p.name}</span><br />
              <span className="s">{[p.address, `${p.publicEvents} ${p.publicEvents === 1 ? "evento" : "eventos"}`, `${p.followerCount} ${p.followerCount === 1 ? "seguidor" : "seguidores"}`].filter(Boolean).join(" · ")}</span></span>
          </Link>
        ))}
      </section>
      <p className="muted small" style={{ textAlign: "center" }}>¿Tu parroquia no está? <Link href="/solicitud-parroquia">Registrar mi parroquia</Link></p>
    </PublicShell>
  );
}
