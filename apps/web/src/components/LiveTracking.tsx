"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { pad } from "@/lib/format";
import type { LivePerson } from "./MapView";

export interface TrackingItem {
  participantId: string; number: number; firstName: string; lastName: string; latitude: number; longitude: number; accuracyM: number | null;
  recordedAt: string; receivedAt: string; stale: boolean;
}
export interface TrackingData { enabled: boolean; eventStatus: string; sharing: number; staleAfterMs: number; serverTime: string; items: TrackingItem[] }

/** «hace 3 min» respecto de la hora del servidor (no la del teléfono del personal). */
export const ago = (iso: string, serverTime: string) => {
  const s = Math.max(0, Math.round((new Date(serverTime).getTime() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
};

/**
 * B5 — Datos del seguimiento en vivo (permiso tracking:read). Se consulta cada 20 s solo mientras la pestaña está
 * visible (cuida datos y servidor). Devuelve también las personas listas para el mapa.
 */
export function useLiveTracking(eventId: string | undefined, enabled: boolean) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!eventId || !enabled) { setData(null); return; }
    let stop = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try { const d = await api<TrackingData>(`/events/${eventId}/tracking`); if (!stop) { setData(d); setError(null); } }
      catch (e) { if (!stop) setError(e instanceof Error ? e.message : "No se pudo cargar el seguimiento."); }
    };
    void load();
    const t = setInterval(load, 20_000);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [eventId, enabled]);
  const people: LivePerson[] = useMemo(() => (data?.items ?? []).map((p) => ({
    id: p.participantId, name: `${pad(p.number)} ${p.firstName} ${p.lastName}`, lat: p.latitude, lng: p.longitude, stale: p.stale,
    detail: `${p.stale ? "Sin señal · " : ""}${ago(p.receivedAt, data!.serverTime)}${p.accuracyM ? ` · ±${Math.round(p.accuracyM)} m` : ""}`,
  })), [data]);
  return { data, people, error };
}
