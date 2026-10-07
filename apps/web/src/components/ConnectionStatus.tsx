"use client";
import { useEffect, useState } from "react";
import { CONNECTING_EVENT } from "@/lib/api";

/**
 * Aviso global mientras se reintenta una lectura porque el API está despertando (Render en reposo, ~20–60 s).
 * Lo activa lib/api.ts con CONNECTING_EVENT; desaparece al conectar o al agotar los reintentos (la pantalla muestra
 * entonces su propio mensaje de error con opción de reintentar).
 */
export function ConnectionStatus() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setActive(!!(e as CustomEvent<{ active: boolean }>).detail?.active);
    window.addEventListener(CONNECTING_EVENT, on);
    return () => window.removeEventListener(CONNECTING_EVENT, on);
  }, []);
  if (!active) return null;
  return (
    <div className="conn-status" role="status" aria-live="polite">
      <span className="conn-dot" aria-hidden="true" />
      <span><b>Conectando con Peregrinos…</b> <span className="conn-sub">El servicio se está iniciando, puede tardar unos segundos.</span></span>
    </div>
  );
}
