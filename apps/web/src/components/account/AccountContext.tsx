"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api, post } from "@/lib/api";

/** Respuesta de GET /api/auth/account/me (la fuente de los datos: no se duplican en el navegador). */
export interface AccountMe {
  kind: "pilgrim";
  user: { id: string; name: string; email: string; documentNumber: string | null; phone: string | null; emailVerified: boolean; emailVerifiedAt: string | null; createdAt: string };
  person: { id: string; firstName: string; lastName: string | null; documentType: string | null; documentNumber: string | null; phone: string | null } | null;
}

interface Ctx { me: AccountMe; reload: () => Promise<void>; logout: () => Promise<void> }
const AccountCtx = createContext<Ctx | null>(null);

/** Sesión de la cuenta del peregrino. Sin sesión → /cuenta/ingresar (nunca el login del personal). */
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<AccountMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try { setError(null); setMe(await api<AccountMe>("/auth/account/me")); }
    catch (e) {
      // Sin sesión (o sesión invalidada tras cambiar la contraseña) → ingreso de la cuenta. Otro error: reintentar.
      if (e instanceof ApiError && e.status === 401) router.replace("/cuenta/ingresar");
      else setError(errorText(e, "No se pudo cargar tu cuenta. Intenta nuevamente."));
    }
  }, [router]);
  useEffect(() => { void reload(); }, [reload]);
  const logout = useCallback(async () => {
    await post("/auth/account/logout").catch(() => undefined);
    router.replace("/cuenta/ingresar");
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
  return <AccountCtx.Provider value={{ me, reload, logout }}>{children}</AccountCtx.Provider>;
}

export function useAccount() {
  const c = useContext(AccountCtx);
  if (!c) throw new Error("useAccount fuera de AccountProvider");
  return c;
}

/** Mensaje para el usuario a partir del error de la API. */
export const errorText = (e: unknown, fallback = "No se pudo completar. Intenta nuevamente.") =>
  e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : fallback;
