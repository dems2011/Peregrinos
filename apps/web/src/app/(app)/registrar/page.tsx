"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Hash, MapPin, ScanLine, Search } from "lucide-react";
import { api, ApiError, post, qs } from "@/lib/api";
import { deviceId, useDebounced } from "@/lib/hooks";
import { avatarColor, fmtDoc, fmtTime, pad } from "@/lib/format";
import type { Checkpoint, Paged, Person } from "@/lib/types";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Page } from "@/components/ui";

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });
type Method = "QR" | "NUMBER" | "SEARCH";
type Step =
  | { kind: "idle" }
  | { kind: "found"; person: Person; method: Method; already: { timestamp: string; operator: string } | null }
  | { kind: "done"; person: Person; at: string }
  | { kind: "dup"; person: Person; at: string; operator: string };

/** Pantalla pensada para registrar muchas personas seguidas: punto ya elegido, un toque para confirmar, vuelve sola. */
export default function Registrar() {
  const { me, event, can } = useApp();
  const [cps, setCps] = useState<Checkpoint[]>([]);
  const [cpId, setCpId] = useState<string>("");
  const [tab, setTab] = useState<Method>("QR");
  const [num, setNum] = useState("");
  const [q, setQ] = useState(""); const dq = useDebounced(q, 250);
  const [results, setResults] = useState<Person[]>([]);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const pos = useRef<{ latitude: number; longitude: number } | null>(null);
  const eid = event?.id;
  const tz = event?.timezone;

  // Puntos disponibles: el operador, solo los suyos; el administrador, todos los activos.
  useEffect(() => {
    if (!eid) return;
    api<{ items: Checkpoint[] }>(`/events/${eid}/checkpoints`).then((r) => {
      const mine = new Set(me.assignments.filter((a) => a.eventId === eid).map((a) => a.checkpointId));
      const list = r.items.filter((c) => c.status === "ACTIVE" && (me.user.role !== "OPERATOR" || mine.has(c.id)));
      setCps(list);
      let saved = ""; try { saved = localStorage.getItem(`pg_cp_${eid}`) ?? ""; } catch { /* sin almacenamiento */ }
      const pref = (me.currentCheckpoint?.eventId === eid ? me.currentCheckpoint.checkpointId : "") || saved;
      setCpId(list.find((c) => c.id === pref)?.id ?? list[0]?.id ?? "");
    }).catch((e) => setErr(e.message));
  }, [eid, me]);
  const pickCp = (id: string) => { setCpId(id); try { localStorage.setItem(`pg_cp_${eid}`, id); } catch { /* sin almacenamiento */ } };

  // Hora en pantalla y última ubicación conocida (se guarda con cada llegada si el permiso está dado)
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!navigator.geolocation) return;
    const w = navigator.geolocation.watchPosition((p) => { pos.current = { latitude: p.coords.latitude, longitude: p.coords.longitude }; }, () => { /* sin permiso: se registra sin GPS */ }, { maximumAge: 60_000, timeout: 20_000 });
    return () => navigator.geolocation.clearWatch(w);
  }, []);

  // Tras confirmar, vuelve sola a la pantalla de registro
  useEffect(() => {
    if (step.kind !== "done") return;
    const t = setTimeout(() => setStep({ kind: "idle" }), 3000);
    return () => clearTimeout(t);
  }, [step]);

  // Búsqueda por nombre / documento / teléfono
  useEffect(() => {
    if (tab !== "SEARCH" || !eid || dq.trim().length < 2) { setResults([]); return; }
    api<Paged<Person>>(`/events/${eid}/participants${qs({ q: dq, pageSize: 10 })}`).then((r) => setResults(r.items)).catch(() => setResults([]));
  }, [dq, tab, eid]);

  const identify = useCallback(async (by: { number?: number; qr?: string }, method: Method) => {
    if (!eid || !cpId) return;
    setErr(null); setBusy(true);
    try {
      const r = await api<{ participant: Person; alreadyCheckedIn: { timestamp: string; operator: string } | null }>(`/events/${eid}/participants/lookup${qs({ ...by, checkpointId: cpId })}`);
      setStep({ kind: "found", person: r.participant, method, already: r.alreadyCheckedIn });
      setNum(""); setQ(""); setResults([]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "No se pudo identificar a la persona.");
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    } finally { setBusy(false); }
  }, [eid, cpId]);

  async function register() {
    if (step.kind !== "found" || !eid) return;
    setBusy(true); setErr(null);
    try {
      const r = await post<{ checkin: { timestamp: string } }>(`/events/${eid}/checkins`, {
        id: crypto.randomUUID(), participantId: step.person.id, checkpointId: cpId, method: step.method,
        timestamp: new Date().toISOString(), deviceId: deviceId(), ...(pos.current ?? {}),
      });
      setStep({ kind: "done", person: step.person, at: r.checkin.timestamp });
    } catch (e) {
      if (e instanceof ApiError && e.code === "ALREADY_CHECKED_IN") setStep({ kind: "dup", person: step.person, at: e.data?.timestamp, operator: e.data?.operator });
      else setErr(e instanceof ApiError ? e.message : "No se pudo registrar. Intenta nuevamente.");
    } finally { setBusy(false); }
  }

  const cp = cps.find((c) => c.id === cpId);
  if (!can("checkin:create")) return <Page title="Registrar llegada"><div className="alert warn">Tu usuario no tiene permiso para registrar llegadas.</div></Page>;
  if (event && (event.status === "FINISHED" || event.status === "CANCELLED")) return <Page title="Registrar llegada"><div className="alert warn">El evento está finalizado o cancelado.</div></Page>;
  if (event?.status === "DRAFT") return <Page title="Registrar llegada"><div className="alert warn">El evento está en borrador: todavía no se pueden registrar llegadas.</div></Page>;

  return (
    <Page title="Registrar llegada">
      <div className="cp-banner">
        <MapPin size={26} />
        <div style={{ flex: 1 }}>
          <small style={{ opacity: .8 }}>PUNTO DE CONTROL</small><br />
          {cps.length > 1
            ? <select aria-label="Punto de control" value={cpId} onChange={(e) => pickCp(e.target.value)}>{cps.map((c) => <option key={c.id} value={c.id}>{c.order}. {c.name}</option>)}</select>
            : <b>{cp?.name ?? "Sin punto asignado"}</b>}
        </div>
        <div style={{ textAlign: "right" }}><b style={{ fontSize: 22 }}>{fmtTime(now, tz)}</b></div>
      </div>
      {!cps.length && <div className="alert warn">No tienes un punto de control asignado. Pídele a un administrador que te asigne uno.</div>}
      <ErrorBox msg={err} />

      {step.kind === "found" && (
        <div className="card found">
          <div className="row"><span className="big" style={{ color: avatarColor(step.person.number) }}>{pad(step.person.number)}</span>{step.person.status !== "ACTIVE" && <span className="pill err">{step.person.status === "INACTIVE" ? "Inactivo" : "Cancelado"}</span>}</div>
          <div className="name">{step.person.firstName} {step.person.lastName}</div>
          <dl className="kv"><dt>DNI</dt><dd>{fmtDoc(step.person.documentNumber)}</dd><dt>Teléfono</dt><dd>{step.person.phone ?? "—"}</dd><dt>Punto</dt><dd>{cp?.name}</dd><dt>Hora</dt><dd>{fmtTime(now, tz)}</dd></dl>
          {step.already && <div className="alert warn"><AlertTriangle size={18} style={{ verticalAlign: "-3px" }} /> Esta persona ya registró su llegada en este punto a las {fmtTime(step.already.timestamp, tz)} ({step.already.operator}).</div>}
          {step.person.status !== "ACTIVE" && <div className="alert err">Esta persona no está activa: no se puede registrar.</div>}
          <button className="btn btn-ok btn-xl" onClick={register} disabled={busy || !!step.already || step.person.status !== "ACTIVE"}><Check size={28} /> REGISTRAR LLEGADA</button>
          <button className="btn" onClick={() => setStep({ kind: "idle" })}>{step.already ? "Aceptar" : "Cancelar"}</button>
        </div>
      )}

      {step.kind === "idle" && cps.length > 0 && (
        <>
          <div className="tabs" role="tablist">
            {([["QR", "Escanear código", ScanLine], ["NUMBER", "Ingresar número", Hash], ["SEARCH", "Buscar", Search]] as const).map(([k, label, Ic]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => { setTab(k); setErr(null); }}><Ic size={16} style={{ verticalAlign: "-3px" }} /> {label}</button>
            ))}
          </div>
          {tab === "QR" && <Scanner paused={busy} onScan={(t) => identify({ qr: t }, "QR")} />}
          {tab === "NUMBER" && (
            <form className="card stack" onSubmit={(e) => { e.preventDefault(); if (num) identify({ number: Number(num) }, "NUMBER"); }}>
              <div className="field" style={{ marginBottom: 0 }}><label htmlFor="num">Número del peregrino</label><input id="num" className="num-input" inputMode="numeric" pattern="[0-9]*" autoFocus value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Ej: 001" /></div>
              <button className="btn btn-primary btn-xl" disabled={!num || busy}><Check size={24} /> Confirmar</button>
            </form>
          )}
          {tab === "SEARCH" && (
            <div className="stack">
              <div className="search"><Search size={20} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, apellido, documento o teléfono" aria-label="Buscar participante" /></div>
              <div className="card flat">{results.map((p) => (
                <button key={p.id} className="list-item" onClick={() => identify({ number: p.number }, "SEARCH")}>
                  <span className="avatar" style={{ background: avatarColor(p.number) }}>{pad(p.number)}</span>
                  <span className="grow"><span className="t">{p.firstName} {p.lastName}</span><br /><span className="s">DNI {fmtDoc(p.documentNumber)}</span></span>
                </button>))}
                {dq.trim().length >= 2 && !results.length && <div className="empty">Sin resultados.</div>}
              </div>
            </div>
          )}
        </>
      )}

      {step.kind === "done" && (
        <div className="success" role="status" onClick={() => setStep({ kind: "idle" })}>
          <div className="check-ic"><Check size={60} strokeWidth={3} /></div>
          <h2>¡Llegada registrada!</h2>
          <div className="box">
            <div className="row"><b style={{ fontSize: 22 }}>{step.person.firstName} {step.person.lastName}</b><span className="avatar" style={{ background: avatarColor(step.person.number) }}>{pad(step.person.number)}</span></div>
            <div className="muted">DNI {fmtDoc(step.person.documentNumber)}{step.person.phone ? ` · ${step.person.phone}` : ""}</div>
            <div><MapPin size={16} style={{ verticalAlign: "-3px" }} /> <b>{cp?.name}</b></div>
            <div className="muted">{fmtTime(step.at, tz)} · {new Date(step.at).toLocaleDateString("es-AR", { timeZone: tz })}</div>
          </div>
          <small>Toca para registrar a la siguiente persona</small>
        </div>
      )}
      {step.kind === "dup" && (
        <div className="success warn" role="alert">
          <div className="check-ic"><AlertTriangle size={56} /></div>
          <h2>Ya registró su llegada</h2>
          <div className="box">
            <b style={{ fontSize: 20 }}>{pad(step.person.number)} — {step.person.firstName} {step.person.lastName}</b>
            <div>Esta persona ya registró su llegada en este punto.</div>
            <div className="muted">A las {fmtTime(step.at, tz)} · registrada por {step.operator}</div>
          </div>
          <button className="btn" style={{ maxWidth: 420 }} onClick={() => setStep({ kind: "idle" })}>Aceptar</button>
        </div>
      )}
    </Page>
  );
}
