"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { PASTORAL_GROUP_KINDS, PASTORAL_GROUP_KIND_LABEL, type PastoralGroupKind } from "@peregrinos/shared";
import { api, post } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useLoad } from "@/lib/hooks";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";

interface Group { id: string; name: string; kind: PastoralGroupKind; leaders: string | null; active: boolean; memberCount: number; meetingCount: number }

/**
 * B5 — Grupos pastorales (permiso group:manage): catequesis, lectores, ministros, jóvenes… con su asistencia propia
 * (distinta de los check-in de eventos y del seguimiento GPS). Nunca se publican.
 */
export default function Grupos() {
  const { can } = useApp();
  const list = useLoad(() => api<{ items: Group[] }>("/organization/groups"), []);
  const [name, setName] = useState(""); const [kind, setKind] = useState<PastoralGroupKind>("CATECHESIS"); const [leaders, setLeaders] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can("group:manage")) return <Page title="Grupos pastorales" back="/configuracion"><div className="alert warn">No tienes permiso para gestionar los grupos.</div></Page>;
  const create = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await post("/organization/groups", { name, kind, leaders: leaders || null }); setName(""); setLeaders(""); await list.reload(); }
    catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <Page title="Grupos pastorales" back="/configuracion">
      <ErrorBox msg={err ?? list.error} />
      <form className="card stack-sm" onSubmit={create}>
        <h2>Nuevo grupo</h2>
        <div className="field"><label htmlFor="gn">Nombre</label><input id="gn" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Catequesis 1.º año" /></div>
        <div className="field"><label htmlFor="gk">Tipo</label><select id="gk" value={kind} onChange={(e) => setKind(e.target.value as PastoralGroupKind)}>{PASTORAL_GROUP_KINDS.map((k) => <option key={k} value={k}>{PASTORAL_GROUP_KIND_LABEL[k]}</option>)}</select></div>
        <div className="field"><label htmlFor="gl">Responsables (opcional)</label><input id="gl" value={leaders} maxLength={240} onChange={(e) => setLeaders(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={busy || name.trim().length < 2}>Crear grupo</button>
      </form>
      <div className="sec-title">Grupos</div>
      {list.loading && !list.data ? <Loading /> : (
        <div className="card flat">
          {!list.data?.items.length && <div className="empty">Todavía no hay grupos.</div>}
          {list.data?.items.map((g) => (
            <Link key={g.id} href={`/configuracion/grupos/${g.id}`} className="list-item" style={{ opacity: g.active ? 1 : .55 }}>
              <span className="grow"><span className="t">{g.name}</span> <span className="pill gray">{PASTORAL_GROUP_KIND_LABEL[g.kind]}</span><br />
                <span className="s">{g.memberCount} {g.memberCount === 1 ? "miembro" : "miembros"} · {g.meetingCount} {g.meetingCount === 1 ? "encuentro" : "encuentros"}{g.leaders ? ` · ${g.leaders}` : ""}</span></span>
              <ChevronRight className="chev" />
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
