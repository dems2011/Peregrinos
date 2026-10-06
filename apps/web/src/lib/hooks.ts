"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSession } from "./api";

/** Carga datos y permite recargarlos. `deps` cambia => vuelve a cargar. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn); fnRef.current = fn;
  const seq = useRef(0);
  const reload = useCallback(async () => {
    // Solo la última carga se aplica: una respuesta lenta de un filtro anterior no pisa la actual.
    const n = ++seq.current;
    try { setError(null); const d = await fnRef.current(); if (n === seq.current) setData(d); }
    catch (e) { if (n === seq.current) setError((e as Error).message); }
    finally { if (n === seq.current) setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); reload(); }, deps);
  return { data, error, loading, reload, setData };
}

/** Actualizaciones en vivo del evento (SSE). Si se corta, renueva la sesión y reconecta. */
export function useEventStream(eventId: string | undefined, onMessage: (type: string, data: any) => void) {
  const ref = useRef(onMessage); ref.current = onMessage;
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!eventId) return;
    let es: EventSource | null = null, closed = false, timer: ReturnType<typeof setTimeout>;
    const open = () => {
      es = new EventSource(`/api/events/${eventId}/stream`, { withCredentials: true });
      es.onopen = () => setLive(true);
      es.onmessage = (e) => { try { const m = JSON.parse(e.data); ref.current(m.type, m.data); } catch { /* mensaje inválido */ } };
      es.onerror = async () => {
        setLive(false); es?.close();
        if (closed) return;
        // Renovación compartida con el cliente del API (evita dos refresh simultáneos con el mismo token).
        await refreshSession();
        timer = setTimeout(open, 3000);
      };
    };
    open();
    return () => { closed = true; clearTimeout(timer); es?.close(); };
  }, [eventId]);
  return live;
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Identificador estable del dispositivo (se guarda en el teléfono). */
export function deviceId() {
  try {
    let id = localStorage.getItem("pg_device");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("pg_device", id); }
    return id;
  } catch { return undefined; }
}
