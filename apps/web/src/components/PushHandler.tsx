"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { api } from "@/lib/api";
import {
  PUSH_OPEN_EVENT, PUSH_RECEIVED_EVENT, initPushListeners, markPushRead, peekPendingPushOpen, pushTargetHref, takePendingPushOpen,
  type PushReceived, type PushTarget,
} from "@/lib/pushNotifications";

/** Cuánto se muestra el aviso dentro de la app cuando llega un push con la app abierta. */
const TOAST_MS = 8000;

/**
 * Único punto que atiende las notificaciones push en la app Android (en el navegador no hace nada):
 *  - Toque (app abierta, en segundo plano o cerrada): abre la pantalla del aviso si hay sesión de cuenta; si no, el
 *    toque queda pendiente y se abre al iniciar sesión (se vuelve a comprobar en cada cambio de pantalla).
 *  - Push con la app abierta: Android no lo muestra en la barra; se muestra un aviso con «Ver».
 * El registro del dispositivo (permiso, token, POST/DELETE) sigue en AccountProvider → lib/pushNotifications.ts.
 */
export function PushHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<PushReceived | null>(null);
  const checking = useRef(false);

  const open = useCallback((t: PushTarget) => {
    markPushRead(t);
    router.push(pushTargetHref(t));
  }, [router]);

  const path = useRef(pathname);
  path.current = pathname;

  // Abre el toque pendiente solo con sesión de la cuenta del peregrino (GET seguro, con reintento si el API despierta).
  // En "/" no: la app arranca ahí y el panel redirige al login, lo que pisaría la navegación; se espera a la siguiente.
  const openPending = useCallback(async () => {
    if (checking.current || !peekPendingPushOpen() || path.current === "/") return;
    checking.current = true;
    try {
      await api("/auth/account/me");
      const t = takePendingPushOpen();
      if (t) open(t);
    } catch {
      // Sin sesión de cuenta (o sin conexión): el toque queda pendiente hasta el próximo cambio de pantalla.
    } finally {
      checking.current = false;
    }
  }, [open]);

  useEffect(() => {
    void initPushListeners();
    const onOpen = () => void openPending();
    const onReceived = (e: Event) => setToast((e as CustomEvent<PushReceived>).detail);
    window.addEventListener(PUSH_OPEN_EVENT, onOpen);
    window.addEventListener(PUSH_RECEIVED_EVENT, onReceived);
    return () => {
      window.removeEventListener(PUSH_OPEN_EVENT, onOpen);
      window.removeEventListener(PUSH_RECEIVED_EVENT, onReceived);
    };
  }, [openPending]);

  // Tras iniciar sesión (o cualquier cambio de pantalla) se reintenta abrir un toque pendiente.
  useEffect(() => { void openPending(); }, [pathname, openPending]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="push-toast" role="status" aria-live="polite">
      <Bell size={22} aria-hidden="true" />
      <div className="grow"><b>{toast.title}</b>{toast.body && <small>{toast.body}</small>}</div>
      <button type="button" className="btn btn-primary" onClick={() => { const t = toast.target; setToast(null); open(t); }}>Ver</button>
      <button type="button" className="lnk" aria-label="Cerrar aviso" onClick={() => setToast(null)} style={{ background: "none", border: 0, color: "#fff", padding: 6, cursor: "pointer" }}><X size={20} /></button>
    </div>
  );
}
