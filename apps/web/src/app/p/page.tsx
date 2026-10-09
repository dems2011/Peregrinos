"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, MapPin, Phone } from "lucide-react";
import { EVENT_TYPE_INFO, type PilgrimMe, type PilgrimRegistrationMe, type RegistrationStatus } from "@peregrinos/shared";
import { ApiError, api, post, upload } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";
import { PublicShell } from "@/components/PublicShell";
import { EventChat } from "@/components/EventChat";
import { fmtDateMedium, fmtDateTimeMedium, fmtTime, money, pad } from "@/lib/format";

/**
 * App del peregrino por enlace personal (sin cuenta). Contratos de /api/pilgrim:
 *  - POST /login { token } | { code } → abre la sesión (cookie) y devuelve el estado.
 *  - GET  /me → inscripción en trámite (stage REGISTRATION) o participante oficial (stage OFFICIAL).
 *  - POST /payment-proof (multipart: archivo + amount, reference, paidAt, note) → solo en trámite.
 *  - GET  /qr.svg → QR de la credencial (solo OFFICIAL).  · POST /logout.
 * Solo muestra datos propios: la API nunca devuelve datos de otros participantes.
 */
type Me = PilgrimMe | PilgrimRegistrationMe;

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const REG_STATUS: Record<RegistrationStatus, [string, string]> = {
  PENDING_PROOF: ["Falta el comprobante", "warn"], IN_REVIEW: ["Comprobante en revisión", "warn"], APPROVED: ["Confirmada", "ok"],
  REJECTED: ["Comprobante rechazado", "err"], CANCELLED: ["Cancelada", "gray"],
};
const CAN_SEND_PROOF: readonly RegistrationStatus[] = ["PENDING_PROOF", "IN_REVIEW", "REJECTED"];
const PROOF_MESSAGES: Record<string, string> = {
  NO_FILE: "Adjunta la foto o el PDF del comprobante.",
  INVALID_FILE: "Sube una foto (JPG, PNG o WEBP) o un PDF.",
  DUPLICATE_FILE: "Ya enviaste este mismo archivo.",
  TOO_MANY_PROOFS: "Llegaste al máximo de envíos. Contacta a la organización.",
  EVENT_CLOSED: "El evento ya terminó o fue cancelado.",
};
const proofText = (e: unknown) => (e instanceof ApiError && e.code && PROOF_MESSAGES[e.code] ? PROOF_MESSAGES[e.code]
  : e instanceof ApiError && e.status === 413 ? "El archivo es demasiado grande (máximo 10 MB)." : errorText(e));

export default function AppPeregrino() {
  const [me, setMe] = useState<Me | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setMe(await api<Me>("/pilgrim/me")); setNeedsLogin(false); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) { setMe(null); setNeedsLogin(true); }
      else setErr(errorText(e, "No se pudo cargar tu información. Intenta nuevamente."));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function logout() {
    await post("/pilgrim/logout").catch(() => undefined);
    setMe(null); setNeedsLogin(true);
  }

  let body: React.ReactNode;
  if (needsLogin) body = <CodeLogin onIn={(m) => { setMe(m); setNeedsLogin(false); }} />;
  else if (!me && err) body = (
    <section className="card stack-sm"><div className="alert err" role="alert">{err}</div><button className="btn" onClick={() => void load()}>Reintentar</button></section>
  );
  else if (!me) body = <div className="acct-loading" role="status">Cargando…</div>;
  else body = (
    <>
      {me.stage === "OFFICIAL" ? <Official me={me} /> : <RegistrationView me={me} onChange={setMe} onRefresh={load} />}
      {(me.stage === "OFFICIAL" || me.registration.status !== "CANCELLED") && <ChatToggle timezone={me.stage === "OFFICIAL" ? me.event.timezone : null}
        viewerId={me.stage === "OFFICIAL" ? `${me.event.id}:n${me.participant.number}` : `${me.event.id}:r${me.registration.documentMasked}`} />}
      <Contacts contacts={me.contacts} />
      <button type="button" className="btn" onClick={() => void logout()}>Salir de este dispositivo</button>
    </>
  );
  return <PublicShell subtitle={me?.stage === "OFFICIAL" ? "Mi credencial" : "Mi inscripción"}>{body}</PublicShell>;
}

/** Entrada con el código corto (el enlace personal entra solo por /p/:token). */
function CodeLogin({ onIn }: { onIn: (m: Me) => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { onIn(await post<Me>("/pilgrim/login", { code: code.trim() })); }
    catch (e2) { setErr(errorText(e2)); } finally { setBusy(false); }
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h1 className="acct-title">Entrar con mi código</h1>
      <p className="muted">Escribe el código que recibiste al inscribirte o que te dio la organización. Si tienes tu enlace personal, ábrelo directamente.</p>
      {err && <div className="alert err" role="alert">{err}</div>}
      <div className="field"><label htmlFor="code">Código personal</label>
        <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="one-time-code" autoCapitalize="characters" maxLength={20} /></div>
      <button className="btn btn-primary" disabled={busy || code.trim().length < 8}>{busy ? "Entrando…" : "Entrar"}</button>
      <p className="muted small" style={{ marginTop: 12 }}>¿Lo perdiste? Pídele uno nuevo a la organización.</p>
    </form>
  );
}

function RegistrationView({ me, onChange, onRefresh }: { me: PilgrimRegistrationMe; onChange: (m: Me) => void; onRefresh: () => Promise<void> }) {
  const r = me.registration, e = me.event;
  const [label, pill] = REG_STATUS[r.status] ?? [r.status, ""];
  return (
    <>
      <section className="card stack-sm">
        <span className="pill">{EVENT_TYPE_INFO[e.type]?.label ?? e.type}</span>
        <h1 className="acct-title" style={{ margin: 0 }}>{e.name}</h1>
        <dl className="kv">
          <dt>Organiza</dt><dd>{e.parishName}</dd>
          <dt>Fecha</dt><dd>{fmtDateTimeMedium(e.startsAt)}{e.endsAt ? ` – ${fmtDateMedium(e.endsAt)}` : ""}</dd>
          {(e.locationName || e.address) && <><dt>Lugar</dt><dd>{[e.locationName, e.address].filter(Boolean).join(" · ")}</dd></>}
        </dl>
      </section>
      <section className="card stack-sm" aria-live="polite">
        <div className="row"><h2 style={{ margin: 0 }}>{r.firstName} {r.lastName}</h2><span className={`pill ${pill}`}>{label}</span></div>
        <p className="muted small">Documento {r.documentMasked}</p>
        {r.status === "REJECTED" && r.rejectionReason && <div className="alert err">Motivo: {r.rejectionReason}. Puedes enviar un comprobante nuevo.</div>}
        {r.status === "IN_REVIEW" && <p>La organización está revisando tu comprobante. Cuando lo confirme, aquí verás tu credencial con QR.</p>}
        {r.status === "PENDING_PROOF" && <p>Para confirmar tu lugar, envía el comprobante de pago.</p>}
        {r.status === "CANCELLED" && <p>Tu inscripción fue cancelada. Si crees que es un error, consulta con la organización.</p>}
        {r.proofsSent > 0 && <p className="muted small">Enviaste {r.proofsSent} comprobante{r.proofsSent === 1 ? "" : "s"}{r.lastProofAt ? `; el último el ${fmtDateTimeMedium(r.lastProofAt)}` : ""}.</p>}
        <button type="button" className="btn btn-sm" onClick={() => void onRefresh()}>Actualizar estado</button>
      </section>
      {(e.registrationFee || e.paymentInstructions) && (
        <section className="card stack-sm">
          <h2>Pago</h2>
          {e.registrationFee && <p>Monto: <b>{money(e.registrationFee)}</b></p>}
          {e.paymentInstructions && <p style={{ whiteSpace: "pre-line" }}>{e.paymentInstructions}</p>}
        </section>
      )}
      {CAN_SEND_PROOF.includes(r.status) && <ProofForm onSent={onChange} />}
    </>
  );
}

function ProofForm({ onSent }: { onSent: (m: Me) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({ amount: "", reference: "", paidAt: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const tooBig = !!file && file.size > MAX_FILE_BYTES;

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!file || tooBig) return;
    setBusy(true); setErr(null); setOk(false);
    const form = new FormData();
    for (const [k, v] of Object.entries(f)) if (v.trim()) form.append(k, v.trim());
    form.append("file", file);
    try {
      onSent(await upload<PilgrimRegistrationMe>("/pilgrim/payment-proof", form));
      setOk(true); setFile(null); setF({ amount: "", reference: "", paidAt: "", note: "" }); setInputKey((k) => k + 1);
    } catch (e2) { setErr(proofText(e2)); } finally { setBusy(false); }
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Enviar comprobante</h2>
      {ok && <div className="alert ok" role="status">Comprobante enviado. La organización lo revisará.</div>}
      {err && <div className="alert err" role="alert">{err}</div>}
      <div className="field"><label htmlFor="pf">Foto o PDF del comprobante <span className="req">*</span></label>
        <input key={inputKey} id="pf" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-describedby="pf-hint" />
        <span id="pf-hint" className="hint">{tooBig ? "El archivo supera los 10 MB." : "JPG, PNG, WEBP o PDF, hasta 10 MB."}</span></div>
      <div className="grid2">
        <div className="field"><label htmlFor="pa">Monto pagado</label><input id="pa" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(",", ".") })} /></div>
        <div className="field"><label htmlFor="pd">Fecha de pago</label><input id="pd" type="date" value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="pr">Referencia u operación</label><input id="pr" value={f.reference} maxLength={60} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
      <div className="field"><label htmlFor="pn">Nota</label><input id="pn" value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      <button className="btn btn-primary" disabled={busy || !file || tooBig}>{busy ? "Enviando…" : "Enviar comprobante"}</button>
    </form>
  );
}

function Official({ me }: { me: PilgrimMe }) {
  const p = me.participant, e = me.event, tz = e.timezone;
  const [qrFailed, setQrFailed] = useState(false);
  return (
    <>
      <section className="card stack-sm" style={{ textAlign: "center" }}>
        <span className="pill ok" style={{ justifySelf: "center" }}>Participante confirmado</span>
        <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>N.º {pad(p.number)}</div>
        <h1 className="acct-title" style={{ margin: 0 }}>{p.firstName} {p.lastName}</h1>
        <p className="muted small">Documento {p.documentMasked}</p>
        {!qrFailed
          // Mismo origen: la cookie de la sesión viaja con la imagen. El SVG como <img> no ejecuta nada.
          ? <img src="/api/pilgrim/qr.svg" alt={`Código QR de ${p.firstName} ${p.lastName}`} width={240} height={240} onError={() => setQrFailed(true)}
              style={{ display: "block", margin: "0 auto", background: "#fff", padding: 8, borderRadius: 12 }} />
          : <div className="alert warn">No se pudo cargar el QR. En el control también pueden buscarte por tu número.</div>}
        <p className="muted small">Muestra este QR o tu número en cada punto de control.</p>
      </section>
      <section className="card stack-sm">
        <h2>{e.name}</h2>
        <dl className="kv">
          <dt>Fecha</dt><dd>{fmtDateTimeMedium(e.startsAt, tz)}{e.endsAt ? ` – ${fmtDateMedium(e.endsAt, tz)}` : ""}</dd>
          {(e.locationName || e.address) && <><dt>Lugar</dt><dd>{[e.locationName, e.address].filter(Boolean).join(" · ")}</dd></>}
        </dl>
        {e.description && <p className="muted" style={{ whiteSpace: "pre-line" }}>{e.description}</p>}
      </section>
      {me.route.length > 0 && (
        <section className="card stack-sm">
          <div className="row"><h2 style={{ margin: 0 }}>Mi recorrido</h2><span className="muted small">{me.progress.done} de {me.progress.total}</span></div>
          <div className="progress" role="progressbar" aria-valuenow={me.progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del recorrido"><i style={{ width: `${me.progress.percent}%` }} /></div>
          {me.route.map((c) => (
            <div key={c.checkpointId} className="acct-item">
              <div className="row">
                <b>{c.order}. {c.name}</b>
                {c.arrived ? <span className="pill ok"><Check size={12} style={{ verticalAlign: "-1px" }} /> {c.timestamp ? fmtTime(c.timestamp, tz) : "Llegaste"}</span> : <span className="pill gray">Pendiente</span>}
              </div>
              {(c.address || c.reference) && <div className="muted small">{[c.address, c.reference].filter(Boolean).join(" · ")}</div>}
              {c.latitude != null && c.longitude != null && (
                <a className="small" href={`https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`} target="_blank" rel="noopener noreferrer">
                  <MapPin size={14} style={{ verticalAlign: "-2px" }} /> Ver en el mapa
                </a>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

/** B1 — Chat del evento (equipo de la parroquia y personas inscritas). Plegado: solo consulta mientras está abierto. */
/** `viewerId`: separa «Limpiar mensajes anteriores» por persona (evento + número o inscripción) en un mismo dispositivo. */
function ChatToggle({ timezone, viewerId }: { timezone: string | null; viewerId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card stack-sm">
      <div className="row"><h2 style={{ margin: 0 }}>Chat del evento</h2><button type="button" className="btn btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Cerrar" : "Abrir"}</button></div>
      {open ? <EventChat base="/pilgrim/chat" timezone={timezone} viewerId={viewerId} /> : <p className="muted small" style={{ margin: 0 }}>Conversa con el equipo de la parroquia y las demás personas inscritas.</p>}
    </section>
  );
}

function Contacts({ contacts }: { contacts: PilgrimMe["contacts"] }) {
  if (!contacts.length) return null;
  return (
    <section className="card stack-sm">
      <h2>Contactos</h2>
      {contacts.map((c) => (
        <div key={c.id} className="acct-item">
          <div className="row"><b>{c.name}</b>{c.isEmergency && <span className="pill err">Emergencias</span>}</div>
          {(c.roleLabel || c.checkpointName) && <div className="muted small">{[c.roleLabel, c.checkpointName].filter(Boolean).join(" · ")}</div>}
          <a href={`tel:${c.phone}`}><Phone size={14} style={{ verticalAlign: "-2px" }} /> {c.phone}</a>
          {c.email && <a className="small" href={`mailto:${c.email}`}>{c.email}</a>}
          {c.notes && <div className="muted small">{c.notes}</div>}
        </div>
      ))}
    </section>
  );
}
