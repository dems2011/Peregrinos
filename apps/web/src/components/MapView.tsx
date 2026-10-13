"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Mapa con marcadores numerados y línea del recorrido.
 * Es el ÚNICO archivo que conoce a Leaflet/OpenStreetMap: para cambiar de proveedor (Google, Mapbox)
 * se reemplaza este componente manteniendo las mismas props.
 */
/** `order` ordena la línea; `label` reemplaza al número en el marcador (p. ej. origen y destino del trayecto). */
export interface MapPoint { id: string; order: number; name: string; lat: number; lng: number; color?: string; label?: string }
/** B5: persona que comparte su ubicación en vivo (gris si no hay señal reciente). */
export interface LivePerson { id: string; name: string; lat: number; lng: number; stale: boolean; detail: string }
interface Props { points: MapPoint[]; line?: boolean; marker?: { lat: number; lng: number } | null; onClick?: (lat: number, lng: number) => void; tall?: boolean; people?: LivePerson[] }

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function MapView({ points, line = true, marker, onClick, tall, people }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const peopleLayer = useRef<L.LayerGroup | null>(null);
  const fittedPeople = useRef(false);
  const click = useRef(onClick); click.current = onClick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([-34.6, -58.44], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    peopleLayer.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => click.current?.(e.latlng.lat, e.latlng.lng));
    map.current = m;
    setTimeout(() => m.invalidateSize(), 120);
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const sorted = [...points].sort((a, b) => a.order - b.order);
    sorted.forEach((p) => {
      L.marker([p.lat, p.lng], {
        title: p.name,
        icon: L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15], html: `<div class="pin" style="background:${p.color ?? "#1677FF"}">${p.label ?? p.order}</div>` }),
      }).addTo(g);
    });
    if (line && sorted.length > 1) L.polyline(sorted.map((p) => [p.lat, p.lng] as [number, number]), { color: "#1677FF", weight: 4, opacity: 0.8 }).addTo(g);
    if (marker) L.circleMarker([marker.lat, marker.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#D94343", fillOpacity: 1 }).addTo(g);
    const pts = [...sorted.map((p) => [p.lat, p.lng] as [number, number]), ...(marker ? [[marker.lat, marker.lng] as [number, number]] : [])];
    if (pts.length === 1) m.setView(pts[0], 15);
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
  }, [points, line, marker]);

  // B5: capa de personas en vivo. Se actualiza sola sin mover el mapa (solo encuadra la primera vez si no hay recorrido).
  useEffect(() => {
    const m = map.current, g = peopleLayer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const p of people ?? []) {
      L.circleMarker([p.lat, p.lng], { radius: 8, color: "#fff", weight: 2, fillColor: p.stale ? "#8A97A6" : "#7B3FE4", fillOpacity: 1 })
        .bindTooltip(`<b>${escHtml(p.name)}</b><br>${escHtml(p.detail)}`)
        .addTo(g);
    }
    if (!fittedPeople.current && !points.length && people?.length) {
      fittedPeople.current = true;
      const pts = people.map((p) => [p.lat, p.lng] as [number, number]);
      if (pts.length === 1) m.setView(pts[0], 15); else m.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    }
  }, [people, points.length]);

  return <div ref={el} className={`map ${tall ? "tall" : ""}`} role="application" aria-label="Mapa del recorrido" />;
}
