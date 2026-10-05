"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { avatarColor, pad } from "@/lib/format";
import { useApp } from "./AppContext";

export function Page({ title, back, action, children }: { title: string; back?: boolean | string; action?: ReactNode; children: ReactNode }) {
  const router = useRouter();
  const { live } = useApp();
  return (
    <>
      <header className="topbar">
        {back && <button className="ic" aria-label="Volver" onClick={() => (typeof back === "string" ? router.push(back) : router.back())}><ArrowLeft size={22} /></button>}
        <h1>{title}</h1>
        <span className="live" title={live ? "Conectado en tiempo real" : "Sin conexión en vivo"}><i className={`dot ${live ? "on" : ""}`} />{live ? "En vivo" : "Sin conexión"}</span>
        {action}
      </header>
      <main className="content">{children}</main>
    </>
  );
}

export function Avatar({ n, lg }: { n: number; lg?: boolean }) {
  return <div className={`avatar ${lg ? "lg" : ""}`} style={{ background: avatarColor(n) }} aria-label={`Número ${pad(n)}`}>{pad(n)}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h2>{title}</h2><button className="ic" style={{ background: "none", border: 0, cursor: "pointer" }} aria-label="Cerrar" onClick={onClose}><X /></button></div>
        {children}
      </div>
    </div>
  );
}

export const Loading = () => <div className="spinner" role="status" aria-label="Cargando" />;
export const ErrorBox = ({ msg }: { msg: string | null }) => (msg ? <div className="alert err" role="alert">{msg}</div> : null);

export const STATUS_PILL: Record<string, [string, string]> = {
  ACTIVE: ["Activo", "ok"], INACTIVE: ["Inactivo", "warn"], CANCELLED: ["Cancelado", "err"],
  PENDING_PROOF: ["Sin comprobante", "gray"], IN_REVIEW: ["En revisión", "warn"], APPROVED: ["Confirmado", "ok"], REJECTED: ["Rechazado", "err"],
  DRAFT: ["Borrador", "gray"], SCHEDULED: ["Programado", ""], IN_PROGRESS: ["En curso", "ok"], FINISHED: ["Finalizado", "gray"], CONFLICT: ["Conflicto", "warn"],
};
export const StatusPill = ({ s }: { s: string }) => <span className={`pill ${STATUS_PILL[s]?.[1] ?? ""}`}>{STATUS_PILL[s]?.[0] ?? s}</span>;

export async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}
