"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, post } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDateTimeMedium, viewerTimeZone } from "@/lib/format";

/** B1 — Bandeja de avisos de las parroquias que sigue la cuenta. */
interface Notice { id: string; kind: "MANUAL" | "EVENT_PUBLISHED"; title: string; body: string; createdAt: string; readAt: string | null; organization: { id: string; name: string }; event: { id: string; name: string } | null }

export default function Avisos() {
  const list = useLoad(() => api<{ unread: number; items: Notice[] }>("/auth/account/notifications"), []);
  const [open, setOpen] = useState<string | null>(null);
  async function read(n: Notice) {
    setOpen(open === n.id ? null : n.id);
    if (!n.readAt) { await post(`/auth/account/notifications/${n.id}/read`).catch(() => undefined); list.setData((d) => d && { unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) }); }
  }
  // Al tocar una notificación push sin evento se llega con ?aviso=<id>: se abre (y se marca leído) ese aviso, una vez.
  const pushed = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (pushed.current === undefined) pushed.current = new URLSearchParams(window.location.search).get("aviso");
    const n = pushed.current && list.data?.items.find((x) => x.id === pushed.current);
    if (!n) return;
    pushed.current = null;
    if (open !== n.id) void read(n);
    requestAnimationFrame(() => document.getElementById(`aviso-${n.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [list.data]);
  if (!list.data) return <div className="acct-loading">{list.error ?? "Cargando…"}</div>;
  return (
    <section className="card stack-sm">
      <div className="row"><h2>Avisos</h2>{list.data.unread > 0 && <button className="btn btn-sm" onClick={async () => { await post("/auth/account/notifications/read-all"); await list.reload(); }}>Marcar todo como leído</button>}</div>
      {!list.data.items.length && <p className="muted">No tienes avisos. Sigue a tus parroquias para recibir sus novedades. <Link href="/parroquias">Buscar parroquias</Link></p>}
      {list.data.items.map((n) => (
        <article key={n.id} id={`aviso-${n.id}`} className="acct-item">
          <button type="button" className="acct-link" style={{ textAlign: "left", textDecoration: "none", color: "inherit" }} onClick={() => void read(n)} aria-expanded={open === n.id}>
            <div className="row"><b style={{ overflowWrap: "anywhere" }}>{!n.readAt && <span className="badge-dot" aria-label="Sin leer" style={{ minWidth: 10, height: 10, padding: 0, marginRight: 6, verticalAlign: "1px" }} />}{n.title}</b></div>
            <div className="muted small">{n.organization.name} · {fmtDateTimeMedium(n.createdAt, viewerTimeZone())}</div>
          </button>
          {open === n.id && <>
            <p style={{ whiteSpace: "pre-line", margin: "6px 0" }}>{n.body}</p>
            <Link className="small" href={`/parroquias/${n.organization.id}`}>Ver la parroquia{n.event ? " y el evento" : ""}</Link>
          </>}
        </article>
      ))}
    </section>
  );
}
