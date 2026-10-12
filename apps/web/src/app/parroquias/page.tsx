"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { normalizeParishCode } from "@peregrinos/shared";
import { ApiError, api } from "@/lib/api";
import { useDebounced, useLoad } from "@/lib/hooks";
import { PublicShell } from "@/components/PublicShell";

/**
 * B1 — Buscador público de parroquias (solo las aprobadas), por nombre, ciudad o código institucional.
 * B4 — Con ?codigo=PAR-482193 (QR o enlace del cartel) abre directamente el perfil de ESA parroquia.
 */
interface Item { id: string; code: string; name: string; address: string | null; description: string | null; followerCount: number; publicEvents: number; logoUrl: string | null }

export default function Parroquias() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const dq = useDebounced(q.trim(), 300);
  const list = useLoad(() => api<{ items: Item[] }>(`/public/parishes${dq ? `?q=${encodeURIComponent(dq)}` : ""}`), [dq]);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("codigo");
    if (!raw) return;
    const code = normalizeParishCode(raw);
    setQ(code ?? raw);
    if (!code) { setCodeErr(`«${raw}» no es un código de parroquia válido (formato PAR-123456).`); return; }
    setResolving(true);
    api<{ parish: { id: string } }>(`/public/parishes/by-code/${encodeURIComponent(code)}`)
      .then((r) => router.replace(`/parroquias/${r.parish.id}`))
      .catch((e) => { setResolving(false); setCodeErr(e instanceof ApiError && e.status === 404 ? `No encontramos ninguna parroquia con el código ${code}.` : "No se pudo abrir la parroquia. Intenta nuevamente."); });
  }, [router]);

  const isCode = !!normalizeParishCode(dq);
  return (
    <PublicShell subtitle="Parroquias">
      <section className="card stack-sm">
        <h1 className="acct-title" style={{ margin: 0 }}>Buscar mi parroquia</h1>
        <p className="muted" style={{ margin: 0 }}>Busca por nombre o ciudad, o escribe el código que figura en el cartel de tu parroquia (por ejemplo, PAR-482193). Síguela para recibir sus avisos e inscríbete en sus eventos.</p>
        <div className="search"><Search size={20} /><input value={q} onChange={(e) => { setQ(e.target.value); setCodeErr(null); }} placeholder="Nombre, ciudad o código" aria-label="Buscar parroquia por nombre, ciudad o código" /></div>
      </section>
      {codeErr && <div className="alert err" role="alert">{codeErr}</div>}
      {resolving ? <div className="spinner" role="status" aria-label="Abriendo la parroquia" /> : (
        <section className="card flat">
          {list.loading && !list.data && <div className="spinner" role="status" aria-label="Cargando" />}
          {list.error && <div className="alert err" role="alert">{list.error}</div>}
          {list.data && !list.data.items.length && <div className="empty">{isCode ? "Ninguna parroquia tiene ese código. Revísalo en el cartel." : dq ? "Ninguna parroquia coincide con la búsqueda." : "Todavía no hay parroquias publicadas."}</div>}
          {list.data && list.data.items.length > 1 && !isCode && dq && <p className="muted small" style={{ margin: "0 0 8px" }}>Si hay parroquias con nombres parecidos, revisa la ciudad y el código antes de seguirla.</p>}
          {list.data?.items.map((p) => (
            <Link key={p.id} href={`/parroquias/${p.id}`} className="list-item">
              {p.logoUrl ? <img className="parish-logo" style={{ width: 48, height: 48, flexBasis: 48 }} src={p.logoUrl} alt="" /> : <span className="parish-logo placeholder" style={{ width: 48, height: 48, flexBasis: 48, fontSize: 20 }} aria-hidden="true">{p.name.charAt(0)}</span>}
              <span className="grow"><span className="t">{p.name}</span><br />
                <span className="s">{[p.address, p.code, `${p.publicEvents} ${p.publicEvents === 1 ? "evento" : "eventos"}`, `${p.followerCount} ${p.followerCount === 1 ? "seguidor" : "seguidores"}`].filter(Boolean).join(" · ")}</span></span>
            </Link>
          ))}
        </section>
      )}
      <p className="muted small" style={{ textAlign: "center" }}>¿Tu parroquia no está? <Link href="/solicitud-parroquia">Registrar mi parroquia</Link></p>
    </PublicShell>
  );
}
