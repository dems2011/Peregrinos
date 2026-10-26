"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { closeBrowserSessions } from "@/lib/pilgrimLogout";
import { disablePushForAccount, enablePushForAccount } from "@/lib/pushNotifications";

/** Respuesta de GET /api/auth/account/me (la fuente de los datos: no se duplican en el navegador). */
export interface AccountMe {
  kind: "pilgrim";
  user: { id: string; name: string; email: string; documentNumber: string | null; phone: string | null; emailVerified: boolean; emailVerifiedAt: string | null; createdAt: string };
  person: { id: string; firstName: string; lastName: string | null; documentType: string | null; documentNumber: string | null; phone: string | null } | null;
}

/** Estado del cierre de sesión: «failed» = el servidor no confirmó el cierre (la sesión puede seguir abierta). */
export type LogoutState = "idle" | "busy" | "failed";
interface Ctx { me: AccountMe; reload: () => Promise<void>; logout: () => Promise<void>; logoutState: LogoutState }
const AccountCtx = createContext<Ctx | null>(null);

/** Sesión de la cuenta del peregrino. Sin sesión → /login (ingreso único: personal y peregrinos). */
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<AccountMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoutState, setLogoutState] = useState<LogoutState>("idle");
  const reload = useCallback(async () => {
    try { setError(null); setMe(await api<AccountMe>("/auth/account/me")); }
    catch (e) {
      // Sin sesión (o sesión invalidada tras cambiar la contraseña) → ingreso de la cuenta. Otro error: reintentar.
      if (e instanceof ApiError && e.status === 401) router.replace("/login");
      else setError(errorText(e, "No se pudo cargar tu cuenta. Intenta nuevamente."));
    }
  }, [router]);
  useEffect(() => { void reload(); }, [reload]);
  // Push (solo en la app Android): con la sesión de cuenta confirmada se registra el dispositivo de esta cuenta.
  const userId = me?.user.id;
  useEffect(() => { if (userId) void enablePushForAccount(); }, [userId]);
  const logout = useCallback(async () => {
    setLogoutState("busy");
    // Primero la baja del dispositivo (necesita la sesión); nunca bloquea ni impide el cierre de sesión.
    await disablePushForAccount();
    // Solo se sale a /login si el servidor confirmó el cierre de las dos sesiones de este navegador. Si no, se avisa
    // y se puede reintentar: nunca se aparenta un cierre que no ocurrió. Otros dispositivos con /p no se tocan.
    if (await closeBrowserSessions()) {
      router.replace("/login");
      return;
    }
    setLogoutState("failed");
    // La sesión puede seguir abierta: el dispositivo vuelve a recibir los avisos de la cuenta (solo en la app).
    void enablePushForAccount();
  }, [router]);
  if (!me && error) {
    return (
      <div className="acct-main">
        <div className="card" role="alert" style={{ display: "grid", gap: 12 }}>
          <div className="alert err">{error}</div>
          <button className="btn" onClick={() => void reload()}>Reintentar</button>
        </div>
      </div>
    );
  }
  if (!me) return <div className="acct-loading" role="status">Cargando…</div>;
  return <AccountCtx.Provider value={{ me, reload, logout, logoutState }}>{children}</AccountCtx.Provider>;
}

export function useAccount() {
  const c = useContext(AccountCtx);
  if (!c) throw new Error("useAccount fuera de AccountProvider");
  return c;
}

/** Mensaje para el usuario a partir del error de la API. */
export const errorText = (e: unknown, fallback = "No se pudo completar. Intenta nuevamente.") =>
  e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : fallback;
