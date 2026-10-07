"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, HeartOff } from "lucide-react";
import { ApiError, api, del, post } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { PublicShell } from "@/components/PublicShell";
import { ParishProfileView } from "@/components/ParishProfileView";
import type { ParishProfile, PublicEvent } from "@/lib/types";

/** B1 — Perfil público de una parroquia: datos, eventos públicos («Inscribirme») y «Seguir» (con cuenta de peregrino). */
export default function PerfilPublico() {
  const { id } = useParams<{ id: string }>();
  const data = useLoad(() => api<{ parish: ParishProfile; events: PublicEvent[] }>(`/public/parishes/${id}`), [id]);
  // null = sin sesión de cuenta; boolean = sigue o no.
  const [following, setFollowing] = useState<boolean | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Al tocar una notificación push de un evento se llega con ?evento=<id>: se resalta y se muestra ese evento.
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => { setHighlight(new URLSearchParams(window.location.search).get("evento")); }, []);
  useEffect(() => {
    if (!highlight || !data.data) return;
    requestAnimationFrame(() => document.getElementById(`evento-${highlight}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [highlight, data.data]);

  useEffect(() => {
    api<{ items: { id: string }[] }>("/auth/account/follows")
      .then((r) => setFollowing(r.items.some((p) => p.id === id)))
      .catch(() => setFollowing(null));
  }, [id]);

  async function toggle() {
    setBusy(true); setErr(null);
    try {
      if (following) await del(`/auth/account/follows/${id}`); else await post("/auth/account/follows", { organizationId: id });
      setFollowing(!following); await data.reload();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo actualizar."); } finally { setBusy(false); }
  }

  const action = following === undefined ? null
    : following === null
      ? <div className="stack-sm"><Link className="btn btn-primary" href="/login">Ingresa para seguir a esta parroquia</Link><span className="muted small">¿No tienes cuenta? <Link href="/cuenta/registro">Crear cuenta</Link></span></div>
      : <button className={`btn ${following ? "" : "btn-primary"}`} disabled={busy} onClick={() => void toggle()}>{following ? <><HeartOff size={18} /> Dejar de seguir</> : <><Heart size={18} /> Seguir</>}</button>;

  return (
    <PublicShell subtitle="Parroquia">
      {err && <div className="alert err" role="alert">{err}</div>}
      {data.error && <section className="card stack-sm"><div className="alert err" role="alert">{data.error}</div><Link className="btn" href="/parroquias">Buscar parroquias</Link></section>}
      {!data.data && !data.error && <div className="acct-loading" role="status">Cargando…</div>}
      {data.data && <ParishProfileView parish={data.data.parish} events={data.data.events} action={action} highlightEventId={highlight} />}
      <p className="muted small" style={{ textAlign: "center" }}><Link href="/parroquias">← Todas las parroquias</Link></p>
    </PublicShell>
  );
}
