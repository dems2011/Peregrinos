"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";
import { fmtDateMedium, fmtDateTimeMedium } from "@/lib/format";

interface EventView { id: string; name: string; status: string; startsAt: string; endsAt: string | null; timezone: string; organization: string }
interface History {
  person: { id: string; firstName: string; lastName: string | null } | null;
  participations: { id: string; number: number; status: string; since: string; attendance: "ATTENDED" | "NO_SHOW" | null; event: EventView }[];
  registrations: { id: string; status: string; createdAt: string; confirmed: boolean; event: EventView }[];
  volunteering: { id: string; status: string; event: EventView; assignments: { id: string; function: string; team: string | null; zone: string | null; shift: { name: string | null; startsAt: string; endsAt: string; cancelled: boolean } | null }[] }[];
}

const EVENT_STATUS: Record<string, string> = { DRAFT: "En preparación", SCHEDULED: "Publicado", IN_PROGRESS: "En curso", FINISHED: "Finalizado", CANCELLED: "Cancelado" };
const VOL_STATUS: Record<string, string> = { REQUESTED: "Solicitado", UNDER_REVIEW: "En revisión", APPROVED: "Aprobado", REJECTED: "Rechazado", WITHDRAWN: "Te retiraste", REVOKED: "Dado de baja", COMPLETED: "Finalizado" };
const hm = (iso: string, tz: string) => fmtDateTimeMedium(iso, tz, undefined, false);
const REG_STATUS: Record<string, string> = { PENDING_PROOF: "Falta el comprobante", IN_REVIEW: "En revisión", APPROVED: "Confirmada", REJECTED: "Rechazada", CANCELLED: "Cancelada" };
const date = (iso: string, tz: string) => fmtDateMedium(iso, tz);
const pad = (n: number) => String(n).padStart(3, "0");

/** Historial (solo lectura) de la Person vinculada a la cuenta. */
export default function MiHistorial() {
  const [h, setH] = useState<History | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<History>("/auth/account/history").then(setH, (e) => setErr(errorText(e))); }, []);
  if (err) return <div className="alert err">{err}</div>;
  if (!h) return <div className="acct-loading">Cargando…</div>;
  const empty = !h.participations.length && !h.registrations.length && !h.volunteering.length;
  return (
    <>
      <section className="card stack-sm">
        <h2>Participaciones</h2>
        {!h.participations.length && <p className="muted">Todavía no tienes participaciones.</p>}
        {h.participations.map((p) => (
          <div key={p.id} className="acct-item">
            <div className="row"><b>{p.event.name}</b><span className="pill">N.º {pad(p.number)}</span></div>
            <div className="muted small">{p.event.organization} · {date(p.event.startsAt, p.event.timezone)} · {EVENT_STATUS[p.event.status] ?? p.event.status}</div>
            <div className="small">
              {p.status === "CANCELLED" ? <span className="pill err">Participación cancelada</span> : <span className="pill ok">Participación confirmada</span>}{" "}
              {p.attendance === "ATTENDED" && <span className="pill ok">Asististe</span>}
              {p.attendance === "NO_SHOW" && <span className="pill gray">Sin asistencia registrada</span>}
            </div>
          </div>
        ))}
      </section>
      <section className="card stack-sm">
        <h2>Inscripciones</h2>
        {!h.registrations.length && <p className="muted">Todavía no tienes inscripciones.</p>}
        {h.registrations.map((r) => (
          <div key={r.id} className="acct-item">
            <div className="row"><b>{r.event.name}</b><span className={`pill ${r.status === "APPROVED" ? "ok" : r.status === "REJECTED" ? "err" : "warn"}`}>{REG_STATUS[r.status] ?? r.status}</span></div>
            <div className="muted small">{r.event.organization} · inscripción del {date(r.createdAt, r.event.timezone)}</div>
          </div>
        ))}
      </section>
      <section className="card stack-sm">
        <h2>Mi voluntariado</h2>
        {!h.volunteering.length && <p className="muted">Todavía no participas como voluntario.</p>}
        {h.volunteering.map((v) => (
          <div key={v.id} className="acct-item">
            <div className="row"><b>{v.event.name}</b><span className={`pill ${v.status === "APPROVED" ? "ok" : "gray"}`}>{VOL_STATUS[v.status] ?? v.status}</span></div>
            <div className="muted small">{v.event.organization} · {date(v.event.startsAt, v.event.timezone)}</div>
            {v.assignments.map((a) => (
              <div key={a.id} className="small">• {a.function}{a.team ? ` · ${a.team}` : ""}{a.zone ? ` · ${a.zone}` : ""}{a.shift ? ` · ${a.shift.name ?? "Turno"} ${hm(a.shift.startsAt, v.event.timezone)}–${hm(a.shift.endsAt, v.event.timezone)}${a.shift.cancelled ? " (cancelado)" : ""}` : ""}</div>
            ))}
          </div>
        ))}
      </section>
      {empty && <p className="muted">Si una parroquia te registró antes de crear tu cuenta, pídele un código y úsalo en «Vincular».</p>}
    </>
  );
}
