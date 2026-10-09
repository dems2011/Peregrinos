"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { hasEventCapability } from "@peregrinos/shared";
import { api, put } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { avatarColor } from "@/lib/format";
import type { Checkpoint } from "@/lib/types";
import type { MapPoint } from "@/components/MapView";
import { useApp, useLive } from "@/components/AppContext";
import { ErrorBox, Loading, Page, StatusPill } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="map" /> });

/**
 * Mapa y recorrido del evento activo: el trayecto (origen → destino, capacidad ROUTE) y los puntos de control (POINTS),
 * según lo que el evento tenga activado en «Datos del evento».
 */
export default function Recorrido() {
  const { event, can } = useApp();
  const eid = event?.id;
  const hasPoints = !!event && hasEventCapability(event, "POINTS");
  const hasRoute = !!event && hasEventCapability(event, "ROUTE");
  const manage = can("checkpoint:manage") && hasPoints;
  const list = useLoad(() => (eid && hasPoints ? api<{ items: Checkpoint[] }>(`/events/${eid}/checkpoints`) : Promise.resolve(null)), [eid, hasPoints]);
  useLive((t) => { if (t.startsWith("checkin.") && hasPoints) list.reload(); });
  const items = list.data?.items ?? [];
  const route = hasRoute ? event?.route ?? null : null;

  const points = useMemo(() => {
    const cps: MapPoint[] = items.filter((c) => c.latitude !== null && c.longitude !== null && c.status === "ACTIVE")
      .map((c) => ({ id: c.id, order: c.order, name: c.name, lat: c.latitude!, lng: c.longitude!, color: avatarColor(c.order) }));
    // Origen y destino del trayecto: primero y último de la línea (O/D en el marcador).
    const ends: MapPoint[] = [];
    if (route?.originLat != null && route.originLng != null) ends.push({ id: "origin", order: 0, name: route.originName ?? "Origen", lat: route.originLat, lng: route.originLng, color: "#18A957", label: "O" });
    if (route?.destinationLat != null && route.destinationLng != null) ends.push({ id: "destination", order: Number.MAX_SAFE_INTEGER, name: route.destinationName ?? "Destino", lat: route.destinationLat, lng: route.destinationLng, color: "#D94343", label: "D" });
    return [...ends, ...cps];
  }, [items, route]);

  async function move(i: number, dir: -1 | 1) {
    const ids = items.map((c) => c.id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await put(`/events/${eid}/checkpoints/order`, { checkpointIds: ids }); list.reload();
  }

  if (!event) return <Page title="Mapa y recorrido" back="/evento"><div className="empty">No hay un evento seleccionado.</div></Page>;
  if (!hasPoints && !hasRoute) return <Page title="Mapa y recorrido" back="/evento"><div className="alert info">Este evento no usa trayecto ni puntos de control. Actívalos en Evento → Datos del evento.</div></Page>;

  return (
    <Page title="Mapa y recorrido" back="/evento" action={manage ? <Link href="/recorrido/nuevo" className="ic" aria-label="Agregar punto"><Plus size={24} /></Link> : undefined}>
      {points.length > 0 ? <MapView points={points} /> : <div className="alert info">{hasPoints ? "Agrega coordenadas a los puntos o al trayecto para verlos en el mapa." : "Agrega las coordenadas del origen y del destino en Evento → Datos del evento para ver el trayecto en el mapa."}</div>}
      {route && (route.originName || route.destinationName || route.distanceKm) && (
        <div className="card stack-sm">
          <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}><span className="pin" style={{ background: "#18A957", flex: "none" }}>O</span><span><b>Origen:</b> {route.originName ?? "—"}{route.originAddress ? ` · ${route.originAddress}` : ""}</span></div>
          <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}><span className="pin" style={{ background: "#D94343", flex: "none" }}>D</span><span><b>Destino:</b> {route.destinationName ?? "—"}{route.destinationAddress ? ` · ${route.destinationAddress}` : ""}</span></div>
          {route.distanceKm && <div className="muted small">Distancia: {route.distanceKm} km</div>}
        </div>
      )}
      <ErrorBox msg={list.error} />
      {hasPoints && (
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
      )}
    </Page>
  );
}
