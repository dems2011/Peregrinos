"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, post } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";
import { fmtDateTimeMedium, viewerTimeZone } from "@/lib/format";

const MESSAGES: Record<string, string> = {
  ACCOUNT_NOT_VERIFIED: "Primero verifica tu correo. Revisa tu bandeja de entrada.",
  ACCOUNT_INACTIVE: "Tu cuenta no está activa.",
  TOO_MANY_CODES: "Generaste demasiados códigos. Intenta de nuevo en una hora.",
  REQUEST_NOT_PENDING: "Esta solicitud ya fue respondida o venció.",
  VOLUNTEER_EXISTS: "Ya eres voluntario en ese evento. Puedes rechazar esta solicitud.",
  EVENT_NOT_ACCEPTING_VOLUNTEERS: "Ese evento ya no admite voluntarios. Puedes rechazar esta solicitud.",
};
const text = (e: unknown) => (e instanceof ApiError && e.code && MESSAGES[e.code] ? MESSAGES[e.code] : errorText(e));
/** Fechas del evento en la zona del evento; vencimientos de la cuenta en la zona del dispositivo. */
const when = (iso: string, zone?: string | null) => fmtDateTimeMedium(iso, zone || viewerTimeZone());

interface VolunteerRequest { id: string; requestedAt: string; expiresAt: string; organization: string; event: { id: string; name: string; startsAt: string; endsAt: string | null; timezone?: string | null } }

/**
 * A5.1 — Voluntariado con organizaciones con las que la persona todavía no participó:
 *  1. genera un código y se lo entrega a la organización;
 *  2. la organización envía una solicitud para un evento;
 *  3. la persona ve aquí quién la pide y para qué evento, y acepta o rechaza. Sin aceptar no queda sumada.
 */
export default function Voluntariado() {
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [requests, setRequests] = useState<VolunteerRequest[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setLoadErr(null); setRequests((await api<{ items: VolunteerRequest[] }>("/auth/account/volunteer-requests")).items); }
    catch (e) { setLoadErr(text(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>, done?: string) {
    setBusy(true); setErr(null); setOk(null);
    try { await fn(); if (done) setOk(done); await load(); } catch (e) { setErr(text(e)); } finally { setBusy(false); }
  }
  const generate = () => act(async () => setIssued(await post<{ code: string; expiresAt: string }>("/auth/account/volunteer-consent-code", {})));
  const answer = (r: VolunteerRequest, accept: boolean) => act(
    () => post(`/auth/account/volunteer-requests/${r.id}/${accept ? "accept" : "decline"}`, {}),
    accept ? `Listo: quedaste como voluntario en «${r.event.name}». Lo verás en «Mi historial».` : "Rechazaste la solicitud.",
  );

  return (
    <>
      {err && <div className="alert err" role="alert">{err}</div>}
      {ok && <div className="alert ok" role="status">{ok}</div>}
      <section className="card">
        <h2>Solicitudes para ser voluntario</h2>
        {loadErr && <div className="alert err" role="alert">{loadErr} <button type="button" className="acct-link" onClick={() => void load()}>Reintentar</button></div>}
        {!requests && !loadErr && <p className="muted" role="status">Cargando…</p>}
        {requests && !requests.length && <p className="muted">No tienes solicitudes pendientes.</p>}
        {requests?.map((r) => (
          <div key={r.id} className="stack-sm" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
            <p><strong>{r.organization}</strong> quiere sumarte como voluntario en <strong>{r.event.name}</strong> ({when(r.event.startsAt, r.event.timezone)}).</p>
            <p className="muted">Si aceptas, esa organización verá tu nombre y tu teléfono para coordinar el voluntariado. Vence: {when(r.expiresAt)}.</p>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={busy} onClick={() => void answer(r, true)}>Aceptar</button>
              <button className="btn" disabled={busy} onClick={() => void answer(r, false)}>Rechazar</button>
            </div>
          </div>
        ))}
      </section>
      <section className="card">
        <h2>Código para una organización</h2>
        <p className="muted">Si una organización con la que nunca participaste quiere sumarte como voluntario, genera un código y entrégaselo a su responsable. Con él te envían una solicitud para un evento, que aparecerá arriba para que la aceptes o la rechaces. El código sirve una sola vez y vence; si generas uno nuevo, el anterior deja de servir.</p>
        {issued && (
          <div className="alert ok" role="status">
            <p>Tu código (se muestra solo ahora):</p>
            <p style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: 2 }}>{issued.code}</p>
            <p>Vence: {when(issued.expiresAt)}</p>
          </div>
        )}
        <button className="btn btn-primary" onClick={() => void generate()} disabled={busy}>{busy ? "Procesando…" : issued ? "Generar otro código" : "Generar código"}</button>
      </section>
    </>
  );
}
