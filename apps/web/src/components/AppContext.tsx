"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { MeResponse, Permission } from "@peregrinos/shared";
import { api, getMe, qs } from "@/lib/api";
import { useEventStream } from "@/lib/hooks";
import type { EventItem } from "@/lib/types";

type Handler = (type: string, data: any) => void;
interface Ctx {
  me: MeResponse;
  can: (p: Permission) => boolean;
  events: EventItem[];
  event: EventItem | null;
  setEventId: (id: string) => void;
  reloadEvents: () => Promise<void>;
  live: boolean;
  pendingPayments: number;
  subscribe: (h: Handler) => () => void;
}
const C = createContext<Ctx | null>(null);
export const useApp = () => { const v = useContext(C); if (!v) throw new Error("useApp fuera de AppProvider"); return v; };

/** Escucha las actualizaciones en vivo del evento activo desde cualquier pantalla. */
export function useLive(handler: Handler) {
  const { subscribe } = useApp();
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => subscribe((t, d) => ref.current(t, d)), [subscribe]);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventId, setEventIdState] = useState<string | undefined>();
  const [pending, setPending] = useState(0);
  const handlers = useRef(new Set<Handler>());

  const can = useCallback((p: Permission) => !!me?.permissions.includes(p), [me]);

  const loadEvents = useCallback(async (m: MeResponse) => {
    const list = (await api<{ items: EventItem[] }>("/events")).items;
    setEvents(list);
    setEventIdState((cur) => {
      if (cur && list.some((e) => e.id === cur)) return cur;
      let saved: string | null = null;
      try { saved = localStorage.getItem("pg_event"); } catch { /* sin almacenamiento */ }
      return (
        list.find((e) => e.id === saved)?.id ??
        list.find((e) => e.id === m.currentCheckpoint?.eventId)?.id ??
        list.find((e) => e.status === "IN_PROGRESS")?.id ?? list[0]?.id
      );
    });
  }, []);

  useEffect(() => {
    (async () => {
      try { const m = await getMe(); setMe(m); await loadEvents(m); }
      catch { router.replace("/login"); }
    })();
  }, [router, loadEvents]);

  const setEventId = useCallback((id: string) => {
    setEventIdState(id);
    try { localStorage.setItem("pg_event", id); } catch { /* sin almacenamiento */ }
  }, []);

  const loadPending = useCallback(async () => {
    if (!me || !eventId || !me.permissions.includes("payment:review")) return setPending(0);
    try { const r = await api<{ counts: Record<string, number> }>(`/events/${eventId}/registrations${qs({ status: "IN_REVIEW", pageSize: 1 })}`); setPending(r.counts.IN_REVIEW ?? 0); }
    catch { /* no crítico */ }
  }, [me, eventId]);
  useEffect(() => { loadPending(); }, [loadPending]);

  const live = useEventStream(eventId, (type, data) => {
    if (type.startsWith("registration.")) loadPending();
    if (type === "participants.changed" || type === "checkin.created") loadEvents(me!);
    handlers.current.forEach((h) => h(type, data));
  });

  const subscribe = useCallback((h: Handler) => { handlers.current.add(h); return () => { handlers.current.delete(h); }; }, []);
  const event = events.find((e) => e.id === eventId) ?? null;
  const value = useMemo<Ctx | null>(() => me && {
    me, can, events, event, setEventId, live, pendingPayments: pending, subscribe,
    reloadEvents: async () => { await loadEvents(me); },
  }, [me, can, events, event, setEventId, live, pending, subscribe, loadEvents]);

  if (!value) return <div className="spinner" aria-label="Cargando" />;
  return <C.Provider value={value}>{children}</C.Provider>;
}
