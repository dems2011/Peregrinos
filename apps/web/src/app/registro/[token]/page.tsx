"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { EVENT_TYPE_INFO, type EventType } from "@peregrinos/shared";
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
  event: { name: string; description: string | null; startsAt: string; endsAt: string | null; parishName: string; type: EventType; locationName: string | null; address: string | null };
  registrationFee: string | null;
  paymentInstructions: string | null;
}
interface Created { access: { link: string; code: string } }

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

  useEffect(() => {
    api<Info>(`/registration/info?token=${encodeURIComponent(token)}`).then(setInfo, (e) => setLoadErr(text(e)));
  }, [token]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const ready = f.firstName.trim() && f.lastName.trim() && f.documentNumber.trim().length >= 5 && f.phone.replace(/\D/g, "").length >= 7;

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!ready || busy) return;
    setBusy(true); setErr(null); setAlready(false);
    try {
      const r = await post<Created>("/registration", { token, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])) });
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
      <div className="alert ok" role="status">¡Listo! Tu inscripción a «{e.name}» quedó registrada.</div>
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
        <button className="btn btn-primary" disabled={busy || !ready}>{busy ? "Inscribiendo…" : "Inscribirme"}</button>
        <p className="muted small" style={{ marginTop: 12 }}>¿Ya te inscribiste? <Link href="/p">Entra con tu código personal</Link>.</p>
      </form>
    </PublicShell>
  );
}
