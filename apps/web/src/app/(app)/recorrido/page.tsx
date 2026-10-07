"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { api, put } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { avatarColor } from "@/lib/format";
import type { Checkpoint } from "@/lib/types";
import { useApp, useLive } from "@/components/AppContext";
import { ErrorBox, Loading, Page, StatusPill } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="map" /> });

export default function Recorrido() {
  const { event, can } = useApp();
  const eid = event?.id;
  const manage = can("checkpoint:manage");
  const list = useLoad(() => (eid ? api<{ items: Checkpoint[] }>(`/events/${eid}/checkpoints`) : Promise.resolve(null)), [eid]);
  useLive((t) => { if (t.startsWith("checkin.")) list.reload(); });
  const items = list.data?.items ?? [];
  const points = useMemo(() => items.filter((c) => c.latitude !== null && c.longitude !== null && c.status === "ACTIVE")
    .map((c) => ({ id: c.id, order: c.order, name: c.name, lat: c.latitude!, lng: c.longitude!, color: avatarColor(c.order) })), [items]);

  async function move(i: number, dir: -1 | 1) {
    const ids = items.map((c) => c.id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await put(`/events/${eid}/checkpoints/order`, { checkpointIds: ids }); list.reload();
  }

  return (
    <Page title="Recorrido" back="/evento" action={manage ? <Link href="/recorrido/nuevo" className="ic" aria-label="Agregar punto"><Plus size={24} /></Link> : undefined}>
      {points.length > 0 ? <MapView points={points} /> : <div className="alert info">Agrega coordenadas a los puntos para verlos en el mapa.</div>}
      <ErrorBox msg={list.error} />
      <div className="card flat">
        {list.loading && !list.data ? <Loading /> : !items.length ? <div className="empty">Todavía no hay puntos de control.</div> :
          items.map((c, i) => (
            <div key={c.id} className="list-item" style={{ cursor: "default", opacity: c.status === "INACTIVE" ? .55 : 1 }}>
              <Link href={`/recorrido/${c.id}`} className="row grow" style={{ justifyContent: "flex-start", gap: 14, minWidth: 0 }}>
                <span className="avatar" style={{ background: avatarColor(c.order) }}>{c.order}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t">{c.name}</span> {c.status === "INACTIVE" && <StatusPill s="INACTIVE" />}<br />
                  <span className="s">{c.address ?? "Sin dirección"}</span>
                  <span className="small" style={{ display: "block" }}>{c.arrivals}{c.capacity ? ` / ${c.capacity}` : ""} personas</span>
                  {c.capacity ? <span className="progress" style={{ display: "block", marginTop: 6 }}><i style={{ width: `${c.percent ?? 0}%` }} /></span> : null}
                </span>
              </Link>
              {manage && <span className="stack-sm"><button className="btn btn-sm" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></button><button className="btn btn-sm" aria-label="Bajar" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></button></span>}
            </div>
          ))}
      </div>
    </Page>
  );
}
