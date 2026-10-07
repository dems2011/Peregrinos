"use client";
import Link from "next/link";
import { useState } from "react";
import { MessagesSquare, QrCode } from "lucide-react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { errorText } from "@/components/account/AccountContext";
import { fmtDateTimeMedium, pad } from "@/lib/format";

/** B1 — Mis eventos: inscripciones, participación (credencial con QR) y chat de cada evento. */
interface MyEvent {
  id: string; name: string; status: string; startsAt: string; timezone: string; organization: { id: string; name: string };
  registration?: { id: string; status: string }; participant?: { id: string; number: number; status: string }; volunteer?: { id: string; status: string };
  chat: boolean;
}
const REG: Record<string, [string, string]> = {
  PENDING_PROOF: ["Falta el comprobante", "warn"], IN_REVIEW: ["En revisión", "warn"], APPROVED: ["Confirmada", "ok"], REJECTED: ["Rechazada", "err"], CANCELLED: ["Cancelada", "gray"],
};

export default function MisEventos() {
  const list = useLoad(() => api<{ items: MyEvent[] }>("/auth/account/events"), []);
  const [qr, setQr] = useState<string | null>(null);
  if (list.error) return <div className="alert err">{errorText(new Error(list.error))}</div>;
  if (!list.data) return <div className="acct-loading">Cargando…</div>;
  return (
    <>
      {!list.data.items.length && (
        <section className="card stack-sm">
          <h2>Todavía no tienes eventos</h2>
          <p className="muted">Busca una parroquia y, en su perfil, pulsa «Inscribirme» en el evento que quieras.</p>
          <Link className="btn btn-primary" href="/parroquias">Buscar una parroquia</Link>
        </section>
      )}
      {list.data.items.map((e) => (
        <section key={e.id} className="card stack-sm">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <b style={{ overflowWrap: "anywhere" }}>{e.name}</b>
              <div className="muted small">{e.organization.name} · {fmtDateTimeMedium(e.startsAt, e.timezone)}</div>
            </div>
            {e.participant ? <span className={`pill ${e.participant.status === "ACTIVE" ? "ok" : "err"}`}>N.º {pad(e.participant.number)}</span>
              : e.registration ? <span className={`pill ${REG[e.registration.status]?.[1] ?? ""}`}>{REG[e.registration.status]?.[0] ?? e.registration.status}</span> : null}
          </div>
          {e.volunteer && <div className="small">Voluntariado: {e.volunteer.status === "APPROVED" ? "aprobado" : e.volunteer.status.toLowerCase()}</div>}
          <div className="btn-row">
            {e.chat && <Link className="btn" href={`/cuenta/eventos/${e.id}`}><MessagesSquare size={18} /> Chat del evento</Link>}
            {e.participant?.status === "ACTIVE" && <button className="btn" onClick={() => setQr(qr === e.participant!.id ? null : e.participant!.id)}><QrCode size={18} /> {qr === e.participant.id ? "Ocultar credencial" : "Mi credencial"}</button>}
          </div>
          {qr && qr === e.participant?.id && (
            <div className="carnet" style={{ marginTop: 8 }}>
              <div className="head"><b>{e.organization.name}</b><span>{e.name}</span></div>
              <div className="num"><small>N.º DE PEREGRINO</small><b>{pad(e.participant.number)}</b></div>
              <div className="qr" style={{ padding: 6 }}><img src={`/api/auth/account/participations/${e.participant.id}/qr.svg`} alt="Código QR de mi credencial" style={{ width: "100%", height: "100%" }} /></div>
            </div>
          )}
          {e.registration && !e.participant && e.registration.status !== "CANCELLED" && <p className="muted small" style={{ margin: 0 }}>Si el evento pide comprobante de pago, envíalo desde tu acceso personal (el enlace o código que recibiste al inscribirte).</p>}
        </section>
      ))}
    </>
  );
}
