"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { EVENT_TYPE_INFO, validateRegistrationAnswers, type EventType, type RegistrationField } from "@peregrinos/shared";
import { ApiError, api, post } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";
import { PublicShell } from "@/components/PublicShell";
import { copyText } from "@/components/ui";
import { fmtDateMedium, fmtDateTimeMedium, money } from "@/lib/format";

/**
 * Inscripción pública con el enlace que comparte la organización (/registro/:token).
 *  - GET  /api/registration/info?token  → datos del evento (404 si no está abierta, 409 EVENT_FULL si no hay cupo).
 *  - POST /api/registration             → crea la inscripción, abre la sesión del peregrino (cookie) y devuelve su
 *    enlace personal y su código: se muestran UNA sola vez. Después sigue en /p (estado del pago y comprobante).
 * El evento no informa su zona horaria en este contrato: las fechas usan la zona por defecto.
 */

interface Info {
  event: { name: string; description: string | null; startsAt: string; endsAt: string | null; parishName: string; type: EventType; locationName: string | null; address: string | null; timezone?: string; organizationId?: string };
  registrationFee: string | null;
  paymentInstructions: string | null;
  /** B1: preguntas propias del evento. */
  fields?: RegistrationField[];
}
interface Created { access: { link: string; code: string }; linkedToAccount?: boolean }
type Answer = string | boolean;

const MESSAGES: Record<string, string> = {
  EVENT_FULL: "El cupo del evento está completo. Consulta con la organización.",
  ALREADY_REGISTERED: "Ya hay una inscripción con ese documento. Entra con tu enlace o tu código personal; si los perdiste, pídelos a la organización.",
};
const text = (e: unknown) => (e instanceof ApiError && e.code && MESSAGES[e.code] ? MESSAGES[e.code] : errorText(e));

export default function Registro() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [f, setF] = useState({ firstName: "", lastName: "", documentNumber: "", phone: "" });
  const [err, setErr] = useState<string | null>(null);
  const [already, setAlready] = useState(false);
  const [busy, setBusy] = useState(false);
  const [access, setAccess] = useState<Created["access"] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [linked, setLinked] = useState(false);
  // B1: con la cuenta abierta, la inscripción queda en la cuenta (historial, chat y avisos). Se precargan sus datos.
  const [account, setAccount] = useState<{ name: string } | null>(null);

  useEffect(() => {
    api<Info>(`/registration/info?token=${encodeURIComponent(token)}`).then(setInfo, (e) => setLoadErr(text(e)));
    api<{ user: { name: string; documentNumber: string | null; phone: string | null }; person: { firstName: string; lastName: string | null } | null }>("/auth/account/me")
      .then((me) => {
        setAccount({ name: me.user.name });
        setF((cur) => ({
          firstName: cur.firstName || me.person?.firstName || "", lastName: cur.lastName || me.person?.lastName || "",
          documentNumber: cur.documentNumber || me.user.documentNumber || "", phone: cur.phone || me.user.phone || "",
        }));
      })
      .catch(() => setAccount(null));
  }, [token]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const fields = info?.fields ?? [];
  const local = validateRegistrationAnswers(fields, answers);
  const ready = f.firstName.trim() && f.lastName.trim() && f.documentNumber.trim().length >= 5 && f.phone.replace(/\D/g, "").length >= 7 && local.ok;

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!ready || busy) return;
    setBusy(true); setErr(null); setAlready(false);
    try {
      const r = await post<Created>("/registration", { token, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])), answers });
      setLinked(!!r.linkedToAccount);
      setAccess(r.access); window.scrollTo(0, 0);
    } catch (e2) {
      setAlready(e2 instanceof ApiError && e2.code === "ALREADY_REGISTERED");
      setErr(text(e2));
    } finally { setBusy(false); }
  }

  if (loadErr) return (
    <PublicShell subtitle="Inscripción">
      <section className="card stack-sm">
        <h1 className="acct-title" style={{ margin: 0 }}>Inscripción no disponible</h1>
        <div className="alert err" role="alert">{loadErr}</div>
        <p className="muted small">¿Ya te inscribiste? <Link href="/p">Entra con tu código personal</Link>.</p>
      </section>
    </PublicShell>
  );
  if (!info) return <PublicShell subtitle="Inscripción"><div className="acct-loading" role="status">Cargando…</div></PublicShell>;
  const e = info.event;

  // Acceso personal: se muestra una sola vez. La sesión ya quedó abierta en este dispositivo.
  if (access) return (
    <PublicShell subtitle="Inscripción">
      <div className="alert ok" role="status">¡Listo! Tu inscripción a «{e.name}» quedó registrada.{linked && " Quedó guardada en tu cuenta: la verás en «Mis eventos», con el chat del evento."}</div>
      <section className="card stack-sm">
        <h2>Guarda tu acceso personal</h2>
        <div className="alert warn">Por seguridad se muestra solo ahora. Con el enlace o el código entras desde cualquier teléfono para ver tu estado y, cuando te confirmen, tu credencial con QR.</div>
        <p className="small"><b>Enlace personal</b></p>
        <div className="copy-box">{access.link}</div>
        <button type="button" className="btn btn-sm" onClick={() => { void copyText(access.link); setCopied("link"); }}>{copied === "link" ? "Copiado" : "Copiar enlace"}</button>
        <p className="small"><b>Código</b></p>
        <div className="copy-box" style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, textAlign: "center" }}>{access.code}</div>
        <button type="button" className="btn btn-sm" onClick={() => { void copyText(access.code); setCopied("code"); }}>{copied === "code" ? "Copiado" : "Copiar código"}</button>
        <label className="check"><input type="checkbox" checked={saved} onChange={(ev) => setSaved(ev.target.checked)} /> Ya guardé mi enlace o mi código</label>
        <button className="btn btn-primary" disabled={!saved} onClick={() => router.replace("/p")}>Continuar</button>
      </section>
    </PublicShell>
  );

  return (
    <PublicShell subtitle="Inscripción">
      <section className="card stack-sm">
        <span className="pill">{EVENT_TYPE_INFO[e.type]?.label ?? e.type}</span>
        <h1 className="acct-title" style={{ margin: 0 }}>{e.name}</h1>
        <dl className="kv">
          <dt>Organiza</dt><dd>{e.parishName}</dd>
          <dt>Fecha</dt><dd>{fmtDateTimeMedium(e.startsAt)}{e.endsAt ? ` – ${fmtDateMedium(e.endsAt)}` : ""}</dd>
          {(e.locationName || e.address) && <><dt>Lugar</dt><dd>{[e.locationName, e.address].filter(Boolean).join(" · ")}</dd></>}
          {info.registrationFee && <><dt>Inscripción</dt><dd>{money(info.registrationFee)}</dd></>}
        </dl>
        {e.description && <p className="muted" style={{ whiteSpace: "pre-line" }}>{e.description}</p>}
        {info.registrationFee && <p className="muted small">Después de inscribirte vas a poder enviar el comprobante de pago desde tu acceso personal.</p>}
      </section>

      <form className="card" onSubmit={submit} noValidate>
        <h2>Tus datos</h2>
        {err && <div className="alert err" role="alert">{err}{already && <> <Link href="/p">Entrar con mi código</Link></>}</div>}
        <div className="field"><label htmlFor="fn">Nombre <span className="req">*</span></label><input id="fn" value={f.firstName} onChange={set("firstName")} maxLength={80} autoComplete="given-name" /></div>
        <div className="field"><label htmlFor="ln">Apellido <span className="req">*</span></label><input id="ln" value={f.lastName} onChange={set("lastName")} maxLength={80} autoComplete="family-name" /></div>
        <div className="field"><label htmlFor="dn">Documento <span className="req">*</span></label><input id="dn" value={f.documentNumber} onChange={set("documentNumber")} maxLength={25} autoComplete="off" />
          <span className="hint">Número de documento o pasaporte (se usa para evitar inscripciones repetidas).</span></div>
        <div className="field"><label htmlFor="ph">Teléfono <span className="req">*</span></label><input id="ph" type="tel" value={f.phone} onChange={set("phone")} maxLength={30} autoComplete="tel" placeholder="Con código de país" /></div>
        {fields.length > 0 && <h3 style={{ margin: "8px 0" }}>Preguntas del evento</h3>}
        {fields.map((q) => <FieldInput key={q.id} field={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />)}
        {account
          ? <p className="muted small">Te inscribes con tu cuenta (<b>{account.name}</b>): la inscripción quedará en «Mis eventos».</p>
          : <p className="muted small">¿Tienes cuenta? <Link href="/login">Ingresa</Link> antes de inscribirte para tenerla en «Mis eventos» y recibir los avisos.</p>}
        <button className="btn btn-primary" disabled={busy || !ready}>{busy ? "Inscribiendo…" : "Inscribirme"}</button>
        <p className="muted small" style={{ marginTop: 12 }}>¿Ya te inscribiste? <Link href="/p">Entra con tu código personal</Link>.</p>
      </form>
    </PublicShell>
  );
}

/** B1 — Pregunta extra del evento según su tipo. */
function FieldInput({ field, value, onChange }: { field: RegistrationField; value: Answer | undefined; onChange: (v: Answer) => void }) {
  const id = `q-${field.id}`;
  const label = <label htmlFor={id}>{field.label}{field.required && <span className="req"> *</span>}</label>;
  const hint = field.help ? <span className="hint">{field.help}</span> : null;
  const str = typeof value === "string" ? value : "";
  if (field.type === "checkbox") {
    return <label className="check" style={{ marginBottom: 14 }}><input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {field.label}{field.required && <span className="req"> *</span>}</label>;
  }
  return (
    <div className="field">
      {label}
      {field.type === "textarea" ? <textarea id={id} value={str} maxLength={1000} onChange={(e) => onChange(e.target.value)} />
        : field.type === "select" ? (
          <select id={id} value={str} onChange={(e) => onChange(e.target.value)}>
            <option value="">Elegir…</option>
            {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : <input id={id} type={field.type === "date" ? "date" : "text"} inputMode={field.type === "number" ? "decimal" : undefined} value={str} maxLength={200} onChange={(e) => onChange(e.target.value)} />}
      {hint}
    </div>
  );
}
