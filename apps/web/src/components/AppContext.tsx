"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { MeResponse, Permission } from "@peregrinos/shared";
import { ApiError, SESSION_EXPIRED_EVENT, api, getMe, qs } from "@/lib/api";
import { StepUpDialog } from "@/components/StepUpDialog";
import { useEventStream } from "@/lib/hooks";
import { PUSH_RECEIVED_EVENT, enablePushForStaff } from "@/lib/pushNotifications";
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
  /** A6: vuelve a leer /auth/me (tras enrolar, desactivar MFA o un step-up). */
  setMe: (m: MeResponse) => void;
  reloadMe: () => Promise<void>;
  /** Avisos visibles en la web: turnos que esperan la decisión del sacerdote y avisos sin leer de la bandeja. */
  pendingTurns: number;
  unreadInbox: number;
  reloadCounters: () => Promise<void>;
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
  const [pendingTurns, setPendingTurns] = useState(0);
  const [unreadInbox, setUnreadInbox] = useState(0);
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

  const [bootError, setBootError] = useState<string | null>(null);
  const boot = useCallback(async () => {
    setBootError(null);
    try {
      const m = await getMe(); setMe(m);
      await loadEvents(m);
      // App Android: registra el teléfono del personal para recibir push (en el navegador no hace nada).
      void enablePushForStaff();
    }
    catch (e) {
      // Solo la falta de sesión lleva al login; un error de red o del servidor se muestra con opción de reintentar.
      if (e instanceof ApiError && e.status === 401) router.replace("/login");
      else setBootError(e instanceof ApiError ? e.message : "No se pudo cargar. Intenta nuevamente.");
    }
  }, [router, loadEvents]);
  useEffect(() => { void boot(); }, [boot]);

  // La sesión venció y no se pudo renovar en cualquier pantalla → login del personal.
  useEffect(() => {
    const onExpired = () => router.replace("/login");
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    };
  }, [router]);

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

  // Contadores de avisos (cada minuto, al volver a la pestaña y al llegar un push con la app abierta). No críticos.
  const loadCounters = useCallback(async () => {
    if (!me) return;
    try { setUnreadInbox((await api<{ unread: number }>("/staff/notifications")).unread); } catch { /* no crítico */ }
    if (me.permissions.includes("turn:decide")) {
      try { setPendingTurns((await api<{ pending: number }>("/organization/turns/summary")).pending); } catch { /* no crítico */ }
    }
  }, [me]);
  useEffect(() => {
    void loadCounters();
    const t = setInterval(() => void loadCounters(), 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void loadCounters(); };
    const onPush = () => void loadCounters();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(PUSH_RECEIVED_EVENT, onPush);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener(PUSH_RECEIVED_EVENT, onPush); };
  }, [loadCounters]);

  const live = useEventStream(eventId, (type, data) => {
    if (type.startsWith("registration.")) loadPending();
    if (me && (type === "participants.changed" || type === "checkin.created")) loadEvents(me).catch(() => { /* se reintenta con el próximo aviso */ });
    handlers.current.forEach((h) => h(type, data));
  });

  const subscribe = useCallback((h: Handler) => { handlers.current.add(h); return () => { handlers.current.delete(h); }; }, []);
  const event = events.find((e) => e.id === eventId) ?? null;
  const value = useMemo<Ctx | null>(() => me && {
    me, can, events, event, setEventId, live, pendingPayments: pending, subscribe,
    reloadEvents: async () => { await loadEvents(me); },
    setMe, reloadMe: boot, pendingTurns, unreadInbox, reloadCounters: loadCounters,
  }, [me, can, events, event, setEventId, live, pending, subscribe, loadEvents, boot, pendingTurns, unreadInbox, loadCounters]);

  if (!value && bootError) {
    return (
      <div className="empty" role="alert">
        <p>{bootError}</p>
        <button className="btn btn-sm" style={{ margin: "0 auto" }} onClick={() => void boot()}>Reintentar</button>
      </div>
    );
  }
  if (!value) return <div className="spinner" aria-label="Cargando" />;
  return <C.Provider value={value}>{children}<StepUpDialog /></C.Provider>;
}
