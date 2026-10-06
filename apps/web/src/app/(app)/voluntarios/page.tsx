"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  VOLUNTEER_REQUEST_STATUS_LABEL, VOLUNTEER_STATUS_LABEL, VOLUNTEER_TRANSITIONS, hasEventCapability, type VolunteerRequestStatus, type VolunteerStatus,
} from "@peregrinos/shared";
import { ApiError, api, patch, post } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Page } from "@/components/ui";
import { fmtDateTimeMedium, fromZonedInput } from "@/lib/format";

interface Volunteer { id: string; status: VolunteerStatus; notes: string | null; decisionReason: string | null; activeAssignments: number; person: { id: string; firstName: string; lastName: string | null; phone: string | null } }
interface Item { id: string; name: string; description: string | null; isActive: boolean }
interface ShiftRow { id: string; name: string | null; startsAt: string; endsAt: string; cancelledAt: string | null; activeAssignments: number; zone: { name: string } | null; team: { name: string } | null }
interface Assignment {
  id: string; revokedAt: string | null; revokeReason: string | null;
  volunteer: { person: { firstName: string; lastName: string | null } }; dutyFunction: { name: string }; team: { name: string } | null; zone: { name: string } | null;
  shift: { name: string | null; startsAt: string; endsAt: string } | null;
}
type Tab = "voluntarios" | "organizacion" | "asignaciones";
const msg = (e: unknown) => (e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : "No se pudo completar la acción.");
/** "6 oct · 14:05" en la zona del evento. */
const time = (iso: string, zone?: string | null) => fmtDateTimeMedium(iso, zone, undefined, false);
const fullName = (p: { firstName: string; lastName: string | null }) => `${p.firstName} ${p.lastName ?? ""}`.trim();
const pill = (s: VolunteerStatus) => (s === "APPROVED" ? "ok" : s === "REQUESTED" || s === "UNDER_REVIEW" ? "warn" : "gray");

/** A5.1 — Voluntariado del evento activo: voluntarios, organización (equipos, zonas, funciones, turnos) y asignaciones. */
export default function Voluntarios() {
  const { event, can } = useApp();
  const [tab, setTab] = useState<Tab>("voluntarios");
  const [err, setErr] = useState<string | null>(null);
  const [vols, setVols] = useState<Volunteer[]>([]);
  const [teams, setTeams] = useState<Item[]>([]); const [zones, setZones] = useState<Item[]>([]); const [fns, setFns] = useState<Item[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]); const [asg, setAsg] = useState<Assignment[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const base = event ? `/events/${event.id}/volunteering` : "";
  const capable = !!event && hasEventCapability(event, "VOLUNTEERS") && can("volunteer:manage");
  const reload = useCallback(async () => {
    if (!base || !capable) return;
    try {
      const [v, t, z, f, s, a] = await Promise.all([
        api<{ items: Volunteer[] }>(`${base}/volunteers`), api<{ items: Item[] }>(`${base}/teams`), api<{ items: Item[] }>(`${base}/zones`),
        api<{ items: Item[] }>(`${base}/functions`), api<{ items: ShiftRow[] }>(`${base}/shifts`), api<{ items: Assignment[] }>(`${base}/assignments`),
      ]);
      setVols(v.items); setTeams(t.items); setZones(z.items); setFns(f.items); setShifts(s.items); setAsg(a.items);
    } catch (e) { setErr(msg(e)); }
    finally { setLoaded(base); }
  }, [base, capable]);
  useEffect(() => { void reload(); }, [reload]);
  const run = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await reload(); return true; } catch (e) { setErr(msg(e)); return false; } };

  if (!can("volunteer:manage")) return <Page title="Voluntarios"><div className="alert warn">No tienes permiso para gestionar voluntarios.</div></Page>;
  if (!event) return <Page title="Voluntarios"><div className="empty">No hay un evento seleccionado.</div></Page>;
  if (!capable) return <Page title="Voluntarios"><div className="alert info">Este evento no tiene activado el voluntariado. Actívalo en Configuración → Evento.</div></Page>;
  if (loaded !== base) return <Page title="Voluntarios"><div className="spinner" role="status" aria-label="Cargando" /></Page>;

  return (
    <Page title="Voluntarios">
      <div className="btn-row" role="tablist" style={{ marginBottom: 12 }}>
        {(["voluntarios", "organizacion", "asignaciones"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`btn btn-sm ${tab === t ? "btn-primary" : ""}`} onClick={() => setTab(t)}>
            {t === "voluntarios" ? "Voluntarios" : t === "organizacion" ? "Organización" : "Asignaciones"}
          </button>
        ))}
      </div>
      <ErrorBox msg={err} />
      {tab === "voluntarios" && <VolunteersTab vols={vols} base={base} run={run} />}
      {tab === "organizacion" && <OrgTab base={base} run={run} teams={teams} zones={zones} fns={fns} shifts={shifts} />}
      {tab === "asignaciones" && <AssignmentsTab base={base} run={run} vols={vols} teams={teams} zones={zones} fns={fns} shifts={shifts} asg={asg} />}
    </Page>
  );
}

type Run = (fn: () => Promise<unknown>) => Promise<boolean>;

function VolunteersTab({ vols, base, run }: { vols: Volunteer[]; base: string; run: Run }) {
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", documentNumber: "" });
  const [candidates, setCandidates] = useState<{ id: string; firstName: string; lastName: string | null; documentNumber: string | null }[] | null>(null);
  async function add(choice: { personId?: string; confirmNewPerson?: true } = {}) {
    try {
      await post(`${base}/volunteers`, { ...(choice.personId ? {} : Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim()))), ...choice });
      setCandidates(null); setF({ firstName: "", lastName: "", phone: "", documentNumber: "" }); await run(async () => undefined);
    } catch (e) {
      if (e instanceof ApiError && e.code === "POSSIBLE_DUPLICATE") setCandidates(e.data?.candidates ?? []);
      else await run(() => Promise.reject(e));
    }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void add(); };
  const change = (v: Volunteer, to: VolunteerStatus) => {
    const reason = to === "REJECTED" || to === "REVOKED" ? window.prompt("Motivo") ?? "" : undefined;
    if (reason !== undefined && reason.trim().length < 3) return;
    void run(() => post(`${base}/volunteers/${v.id}/status`, { to, ...(reason ? { reason } : {}) }));
  };
  return (
    <>
      <form className="card" onSubmit={submit} noValidate>
        <h2>Agregar voluntario</h2>
        <p className="muted">Si la persona ya está registrada (mismo documento o teléfono), se te pedirá elegirla: no se duplica su identidad.</p>
        <div className="grid2">
          <div className="field"><label htmlFor="vn">Nombre <span className="req">*</span></label><input id="vn" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></div>
          <div className="field"><label htmlFor="va">Apellido</label><input id="va" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></div>
          <div className="field"><label htmlFor="vd">Documento</label><input id="vd" value={f.documentNumber} onChange={(e) => setF({ ...f, documentNumber: e.target.value })} /></div>
          <div className="field"><label htmlFor="vt">Teléfono</label><input id="vt" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        </div>
        {candidates && (
          <div className="alert warn">
            <p>Hay personas con el mismo documento o teléfono:</p>
            {candidates.map((c) => <button type="button" key={c.id} className="btn btn-sm" onClick={() => void add({ personId: c.id })}>Es {c.firstName} {c.lastName ?? ""} ({c.documentNumber ?? "sin documento"})</button>)}
            <button type="button" className="btn btn-sm" onClick={() => void add({ confirmNewPerson: true })}>Es otra persona</button>
          </div>
        )}
        <button className="btn btn-primary" disabled={!f.firstName.trim()}>Agregar (aprobado)</button>
      </form>
      <ConsentRequests base={base} run={run} />
      <section className="card flat">
        {!vols.length && <div className="empty">Todavía no hay voluntarios.</div>}
        {vols.map((v) => (
          <div key={v.id} className="list-item" style={{ cursor: "default", flexWrap: "wrap" }}>
            <span className="grow"><span className="t">{fullName(v.person)}</span> <span className={`pill ${pill(v.status)}`}>{VOLUNTEER_STATUS_LABEL[v.status]}</span><br />
              <span className="s">{v.activeAssignments} asignación(es) vigente(s){v.decisionReason ? ` · ${v.decisionReason}` : ""}</span></span>
            <span className="btn-row">{VOLUNTEER_TRANSITIONS[v.status].map((to) => <button key={to} className="btn btn-sm" onClick={() => change(v, to)}>{VOLUNTEER_STATUS_LABEL[to]}</button>)}</span>
          </div>
        ))}
      </section>
    </>
  );
}

interface ConsentRequest { id: string; requestedAt: string; expiresAt: string; status: VolunteerRequestStatus; volunteer: { id: string; person: { firstName: string; lastName: string | null } } | null }

/**
 * A5.1 — Personas con cuenta que nunca participaron con esta organización: con el código que generaron en su cuenta se
 * envía una solicitud para ESTE evento. Sus datos aparecen solo cuando la persona la acepta.
 */
function ConsentRequests({ base, run }: { base: string; run: Run }) {
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [items, setItems] = useState<ConsentRequest[]>([]);
  const zone = useApp().event?.timezone;
  const load = useCallback(async () => { try { setItems((await api<{ items: ConsentRequest[] }>(`${base}/consent-requests`)).items); } catch { /* el error general ya se muestra arriba */ } }, [base]);
  useEffect(() => { void load(); }, [load]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSent(false);
    if (await run(() => post(`${base}/consent-requests`, { code: code.trim() }))) { setCode(""); setSent(true); await load(); }
  };
  return (
    <form className="card stack-sm" onSubmit={submit} noValidate>
      <h2>Sumar con el código de la persona</h2>
      <p className="muted">Si la persona tiene cuenta en Peregrinos pero nunca participó con ustedes, pídele que genere su código en «Mi cuenta → Voluntariado». Con el código se le envía una solicitud para este evento; queda como voluntaria (aprobada) cuando ella la acepta.</p>
      {sent && <div className="alert ok" role="status">Solicitud enviada. La persona debe aceptarla desde su cuenta.</div>}
      <div className="field"><label htmlFor="vc">Código de la persona</label>
        <input id="vc" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" placeholder="ABCDE-FGHJK" /></div>
      <button className="btn btn-primary" disabled={code.trim().length < 10}>Enviar solicitud</button>
      {items.length > 0 && (
        <div className="stack-sm">
          <h3>Solicitudes enviadas</h3>
          {items.map((r) => (
            <div key={r.id} className="row">
              <span>{r.volunteer ? fullName(r.volunteer.person) : "Persona (se muestra al aceptar)"} · {time(r.requestedAt, zone)}</span>
              <span className={`pill ${r.status === "ACCEPTED" ? "ok" : r.status === "PENDING" ? "warn" : "gray"}`}>{VOLUNTEER_REQUEST_STATUS_LABEL[r.status]}</span>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}

function OrgTab({ base, run, teams, zones, fns, shifts }: { base: string; run: Run; teams: Item[]; zones: Item[]; fns: Item[]; shifts: ShiftRow[] }) {
  return (
    <>
      <Catalog title="Equipos" path="teams" items={teams} base={base} run={run} placeholder="Ej: Seguridad, Agua, Recepción" />
      <Catalog title="Zonas" path="zones" items={zones} base={base} run={run} placeholder="Ej: Puerta principal, Sector norte" />
      <Catalog title="Funciones" path="functions" items={fns} base={base} run={run} placeholder="Ej: Control de acceso, Hidratación" />
      <Shifts base={base} run={run} shifts={shifts} teams={teams} zones={zones} />
    </>
  );
}

function Catalog({ title, path, items, base, run, placeholder }: { title: string; path: string; items: Item[]; base: string; run: Run; placeholder: string }) {
  const [name, setName] = useState("");
  return (
    <section className="card stack-sm">
      <h2>{title}</h2>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post(`${base}/${path}`, { name }))) setName(""); }}>
        <input aria-label={`Nuevo: ${title}`} value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} style={{ flex: 1, minHeight: 44, borderRadius: 10, border: "1px solid var(--line)", padding: "0 12px" }} />
        <button className="btn btn-sm btn-primary" disabled={name.trim().length < 2}>Agregar</button>
      </form>
      {items.map((i) => (
        <div key={i.id} className="row">
          <span style={{ opacity: i.isActive ? 1 : 0.5 }}>{i.name}{!i.isActive && " (desactivado)"}</span>
          <button className="btn btn-sm" onClick={() => void run(() => patch(`${base}/${path}/${i.id}`, { isActive: !i.isActive }))}>{i.isActive ? "Desactivar" : "Activar"}</button>
        </div>
      ))}
    </section>
  );
}

function Shifts({ base, run, shifts, teams, zones }: { base: string; run: Run; shifts: ShiftRow[]; teams: Item[]; zones: Item[] }) {
  const [f, setF] = useState({ name: "", startsAt: "", endsAt: "", zoneId: "", teamId: "" });
  const zone = useApp().event?.timezone;
  // El turno se carga en la hora del evento, no en la del navegador.
  const iso = (s: string) => fromZonedInput(s, zone);
  return (
    <section className="card stack-sm">
      <h2>Turnos</h2>
      <form className="stack-sm" onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => post(`${base}/shifts`, { ...(f.name ? { name: f.name } : {}), startsAt: iso(f.startsAt), endsAt: iso(f.endsAt), zoneId: f.zoneId || null, teamId: f.teamId || null }));
        if (ok) setF({ name: "", startsAt: "", endsAt: "", zoneId: "", teamId: "" });
      }}>
        <div className="grid2">
          <div className="field"><label htmlFor="sn">Nombre (opcional)</label><input id="sn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej: Mañana" /></div>
          <div className="field"><label htmlFor="sz">Zona (opcional)</label><select id="sz" value={f.zoneId} onChange={(e) => setF({ ...f, zoneId: e.target.value })}><option value="">—</option>{zones.filter((z) => z.isActive).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></div>
          <div className="field"><label htmlFor="ss">Inicio</label><input id="ss" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></div>
          <div className="field"><label htmlFor="se">Fin</label><input id="se" type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></div>
          <div className="field"><label htmlFor="st">Equipo (opcional)</label><select id="st" value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })}><option value="">—</option>{teams.filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        </div>
        <button className="btn btn-primary" disabled={!f.startsAt || !f.endsAt}>Crear turno</button>
      </form>
      {shifts.map((s) => (
        <div key={s.id} className="row" style={{ opacity: s.cancelledAt ? 0.5 : 1 }}>
          <span>{s.name ? `${s.name} · ` : ""}{time(s.startsAt, zone)} – {time(s.endsAt, zone)}{s.zone ? ` · ${s.zone.name}` : ""}{s.team ? ` · ${s.team.name}` : ""} · {s.activeAssignments} asignado(s){s.cancelledAt && " · cancelado"}</span>
          {!s.cancelledAt && <button className="btn btn-sm" onClick={() => void run(() => patch(`${base}/shifts/${s.id}`, { cancel: true }))}>Cancelar</button>}
        </div>
      ))}
    </section>
  );
}

function AssignmentsTab({ base, run, vols, teams, zones, fns, shifts, asg }: { base: string; run: Run; vols: Volunteer[]; teams: Item[]; zones: Item[]; fns: Item[]; shifts: ShiftRow[]; asg: Assignment[] }) {
  const [f, setF] = useState({ volunteerId: "", functionId: "", teamId: "", zoneId: "", shiftId: "" });
  const approved = vols.filter((v) => v.status === "APPROVED");
  const zone = useApp().event?.timezone;
  return (
    <>
      <form className="card stack-sm" onSubmit={async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
        if (await run(() => post(`${base}/assignments`, body))) setF({ volunteerId: "", functionId: "", teamId: "", zoneId: "", shiftId: "" });
      }}>
        <h2>Nueva asignación</h2>
        <div className="grid2">
          <div className="field"><label htmlFor="av">Voluntario (aprobado)</label><select id="av" value={f.volunteerId} onChange={(e) => setF({ ...f, volunteerId: e.target.value })}><option value="">Elegir…</option>{approved.map((v) => <option key={v.id} value={v.id}>{fullName(v.person)}</option>)}</select></div>
          <div className="field"><label htmlFor="af">Función</label><select id="af" value={f.functionId} onChange={(e) => setF({ ...f, functionId: e.target.value })}><option value="">Elegir…</option>{fns.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div className="field"><label htmlFor="as">Turno (opcional)</label><select id="as" value={f.shiftId} onChange={(e) => setF({ ...f, shiftId: e.target.value })}><option value="">—</option>{shifts.filter((s) => !s.cancelledAt).map((s) => <option key={s.id} value={s.id}>{s.name ? `${s.name} · ` : ""}{time(s.startsAt, zone)}</option>)}</select></div>
          <div className="field"><label htmlFor="az">Zona (opcional)</label><select id="az" value={f.zoneId} onChange={(e) => setF({ ...f, zoneId: e.target.value })}><option value="">—</option>{zones.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div className="field"><label htmlFor="at">Equipo (opcional)</label><select id="at" value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })}><option value="">—</option>{teams.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        </div>
        <button className="btn btn-primary" disabled={!f.volunteerId || !f.functionId}>Asignar</button>
      </form>
      <section className="card flat">
        {!asg.length && <div className="empty">Todavía no hay asignaciones.</div>}
        {asg.map((a) => (
          <div key={a.id} className="list-item" style={{ cursor: "default", opacity: a.revokedAt ? 0.55 : 1 }}>
            <span className="grow"><span className="t">{fullName(a.volunteer.person)}</span> · {a.dutyFunction.name}<br />
              <span className="s">{[a.team?.name, a.zone?.name, a.shift ? `${a.shift.name ?? "Turno"} ${time(a.shift.startsAt, zone)}` : null].filter(Boolean).join(" · ") || "Sin equipo, zona ni turno"}{a.revokedAt ? ` · revocada: ${a.revokeReason ?? ""}` : ""}</span></span>
            {!a.revokedAt && <button className="btn btn-sm" onClick={() => { const reason = window.prompt("Motivo de la revocación") ?? ""; if (reason.trim().length >= 3) void run(() => post(`${base}/assignments/${a.id}/revoke`, { reason })); }}>Revocar</button>}
          </div>
        ))}
      </section>
    </>
  );
}
