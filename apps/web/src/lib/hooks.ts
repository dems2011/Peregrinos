"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Carga datos y permite recargarlos. `deps` cambia => vuelve a cargar. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn); fnRef.current = fn;
  const reload = useCallback(async () => {
    try { setError(null); setData(await fnRef.current()); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
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
        try { await fetch("/api/auth/refresh", { method: "POST", credentials: "include", headers: { "X-PG-Client": "web" } }); } catch { /* sin red */ }
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
