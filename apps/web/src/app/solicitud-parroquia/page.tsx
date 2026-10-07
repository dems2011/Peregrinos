"use client";
import Link from "next/link";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ORGANIZATION_STATUS_LABEL, SOCIAL_NETWORK_LABEL, normalizeSocial, normalizeWebsite, type OrganizationStatus, type SocialNetwork } from "@peregrinos/shared";
import { ApiError, api, post, upload } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";
import { AreaPicker, type AreaPickerValue } from "@/components/AreaPicker";
import { PublicShell } from "@/components/PublicShell";
import { PhotoCropper } from "@/components/PhotoCropper";
import { copyText } from "@/components/ui";
import { fmtDateTimeMedium, viewerTimeZone } from "@/lib/format";

/**
 * A3 — Solicitud pública de una nueva parroquia (POST /api/organization-requests) y seguimiento con el enlace privado
 * que devuelve el alta (?token=…: GET /status y, si fue rechazada, POST /resubmit). No crea organización ni cuenta:
 * la decide la plataforma. El país y la localidad salen del selector geográfico (AreaPicker); el contrato guarda
 * countryCode (ISO 3166-1 alfa-2) y la localidad como texto, así que el área elegida se envía por su nombre.
 * B2: datos opcionales del perfil público (sitio web, Instagram, Facebook, YouTube) y foto principal recortada a 2:1;
 * la foto se sube después del alta con el token privado (PUT /organization-requests/photo).
 */

/** Vista pública de la solicitud (lo único que devuelve la API al solicitante). */
interface RequestView { id: string; parishName: string; status: OrganizationStatus; rejectionReason: string | null; submissionCount: number; createdAt: string; updatedAt: string; hasPhoto?: boolean }
interface Fields { parishName: string; contactName: string; contactEmail: string; contactPhone: string; address: string; notes: string; website: string; instagram: string; facebook: string; youtube: string }

const EMPTY: Fields = { parishName: "", contactName: "", contactEmail: "", contactPhone: "", address: "", notes: "", website: "", instagram: "", facebook: "", youtube: "" };
const SOCIAL: { key: SocialNetwork; placeholder: string }[] = [
  { key: "instagram", placeholder: "@parroquia o enlace" },
  { key: "facebook", placeholder: "@parroquia o enlace" },
  { key: "youtube", placeholder: "@parroquia o enlace" },
];
/** Sube la foto recortada con el token privado (en cabecera, nunca en la URL). */
const sendPhoto = (token: string, photo: Blob) => {
  const form = new FormData(); form.append("file", photo, "parroquia.jpg");
  return upload<{ request: RequestView }>("/organization-requests/photo", form, "PUT", { "X-Request-Token": token });
};
const LOCALITY_MAX = 160;
const MESSAGES: Record<string, string> = {
  REQUEST_ALREADY_PENDING: "Ya hay una solicitud en revisión para esta parroquia con este correo. Usa el enlace que te enviamos para consultarla.",
  REQUEST_NOT_REJECTED: "Esta solicitud ya no está rechazada: vuelve a consultar su estado.",
};
const text = (e: unknown) => (e instanceof ApiError && e.code && MESSAGES[e.code] ? MESSAGES[e.code] : errorText(e));
const pillOf = (s: OrganizationStatus) => (s === "APPROVED" ? "ok" : s === "REJECTED" ? "err" : "warn");
const when = (iso: string) => fmtDateTimeMedium(iso, viewerTimeZone());

/** Localidad para el contrato (texto): la escrita a mano o el área elegida, de la más específica a la más general. */
function localityOf(v: AreaPickerValue | null): string | undefined {
  if (!v) return undefined;
  const names = [...(v.freeText ? [v.freeText] : []), ...v.path.map((p) => p.name).reverse()];
  const s = names.join(", ").slice(0, LOCALITY_MAX).trim();
  return s || undefined;
}

function RequestForm({ initial, withTerms, submitLabel, busy, onSubmit }: {
  initial?: Partial<Fields>; withTerms: boolean; submitLabel: string; busy: boolean;
  onSubmit: (body: Record<string, unknown>, photo: Blob | null) => void;
}) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [f, setF] = useState<Fields>({ ...EMPTY, ...initial });
  const [place, setPlace] = useState<AreaPickerValue | null>(null);
  // Sin catálogo geográfico (o si no carga): país por código y localidad escrita.
  const [manual, setManual] = useState(false);
  const [manualCountry, setManualCountry] = useState("");
  const [manualLocality, setManualLocality] = useState("");
  const [terms, setTerms] = useState(false);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const countryCode = manual ? manualCountry.trim().toUpperCase() : place?.countryCode ?? "";
  const locality = manual ? manualLocality.trim() || undefined : localityOf(place);
  // Los datos del perfil público son opcionales, pero si se escriben tienen que ser válidos.
  const webErr = f.website.trim() && !normalizeWebsite(f.website) ? "Escribe una dirección como https://parroquia.org" : null;
  const socialErr = (k: SocialNetwork) => (f[k].trim() && !normalizeSocial(k, f[k]) ? `Escribe @usuario o el enlace de ${SOCIAL_NETWORK_LABEL[k]}` : null);
  const profileOk = !webErr && SOCIAL.every(({ key }) => !socialErr(key));
  const ready = f.parishName.trim().length >= 3 && f.contactName.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.contactEmail)
    && /^[A-Z]{2}$/.test(countryCode) && (!withTerms || terms) && profileOk;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    // Los opcionales vacíos no se envían (la API los guarda como ausentes).
    const optional = Object.fromEntries((["contactPhone", "address", "notes", "website", "instagram", "facebook", "youtube"] as const).map((k) => [k, f[k].trim()]).filter(([, v]) => v));
    onSubmit({
      parishName: f.parishName.trim(), contactName: f.contactName.trim(), contactEmail: f.contactEmail.trim(), ...optional,
      countryCode, ...(locality ? { locality } : {}), ...(withTerms ? { acceptTerms: true } : {}),
    }, photo);
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="pn">Nombre de la parroquia u organización <span className="req">*</span></label>
        <input id="pn" value={f.parishName} onChange={set("parishName")} maxLength={160} autoComplete="organization" /></div>
      <div className="field"><label htmlFor="cn">Persona de contacto <span className="req">*</span></label>
        <input id="cn" value={f.contactName} onChange={set("contactName")} maxLength={120} autoComplete="name" /></div>
      <div className="field"><label htmlFor="ce">Correo de contacto <span className="req">*</span></label>
        <input id="ce" type="email" value={f.contactEmail} onChange={set("contactEmail")} maxLength={200} autoComplete="email" />
        <span className="hint">Allí te enviaremos el enlace para seguir la solicitud.</span></div>
      <div className="field"><label htmlFor="cp">Teléfono de contacto</label>
        <input id="cp" type="tel" value={f.contactPhone} onChange={set("contactPhone")} maxLength={30} autoComplete="tel" placeholder="Con código de país" /></div>

      {!manual ? (
        <AreaPicker onChange={setPlace} onUnavailable={() => setManual(true)} label="País *" disabled={busy} />
      ) : (
        <>
          <div className="field"><label htmlFor="cc">País (código de 2 letras) <span className="req">*</span></label>
            <input id="cc" value={manualCountry} onChange={(e) => setManualCountry(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase())}
              autoComplete="country" placeholder="Ej.: AR, BR, ES, IT" aria-describedby="cc-hint" />
            <span id="cc-hint" className="hint">Código ISO del país (por ejemplo AR para Argentina).</span></div>
          <div className="field"><label htmlFor="lc">Localidad</label>
            <input id="lc" value={manualLocality} onChange={(e) => setManualLocality(e.target.value)} maxLength={LOCALITY_MAX} autoComplete="address-level2" /></div>
        </>
      )}

      <div className="field"><label htmlFor="ad">Dirección</label>
        <input id="ad" value={f.address} onChange={set("address")} maxLength={240} autoComplete="street-address" /></div>
      <div className="field"><label htmlFor="nt">Comentarios</label>
        <textarea id="nt" value={f.notes} onChange={set("notes")} maxLength={2000} rows={3} placeholder="Por ejemplo: qué eventos organizan y cuántas personas participan." /></div>

      <div className="form-section">
        <h2>Perfil público (opcional)</h2>
        <span className="hint">Con estos datos armamos la página pública de la parroquia. Podrás cambiarlos después desde el perfil.</span>
      </div>
      <div className="field"><label htmlFor="ws">Sitio web oficial</label>
        <input id="ws" type="url" inputMode="url" value={f.website} onChange={set("website")} maxLength={300} autoComplete="url" placeholder="https://parroquia.org"
          aria-invalid={!!webErr} aria-describedby={webErr ? "ws-err" : undefined} />
        {webErr && <span id="ws-err" className="hint" style={{ color: "var(--err)" }}>{webErr}</span>}</div>
      {SOCIAL.map(({ key, placeholder }) => {
        const e = socialErr(key);
        return (
          <div className="field" key={key}><label htmlFor={`sn-${key}`}>{SOCIAL_NETWORK_LABEL[key]}</label>
            <input id={`sn-${key}`} value={f[key]} onChange={set(key)} maxLength={200} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={placeholder}
              aria-invalid={!!e} aria-describedby={e ? `sn-${key}-err` : undefined} />
            {e && <span id={`sn-${key}-err`} className="hint" style={{ color: "var(--err)" }}>{e}</span>}</div>
        );
      })}
      <PhotoCropper disabled={busy} onChange={setPhoto} />
      {withTerms && (
        <label className="check"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> Acepto los términos y condiciones</label>
      )}
      <button className="btn btn-primary" disabled={busy || !ready}>{busy ? "Enviando…" : submitLabel}</button>
    </form>
  );
}

function StatusCard({ r }: { r: RequestView }) {
  return (
    <section className="card stack-sm" aria-live="polite">
      <div className="row"><h2 style={{ margin: 0 }}>{r.parishName}</h2><span className={`pill ${pillOf(r.status)}`}>{ORGANIZATION_STATUS_LABEL[r.status] ?? r.status}</span></div>
      <dl className="kv">
        <dt>Presentada</dt><dd>{when(r.createdAt)}</dd>
        <dt>Última actualización</dt><dd>{when(r.updatedAt)}</dd>
        {r.submissionCount > 1 && <><dt>Presentaciones</dt><dd>{r.submissionCount}</dd></>}
      </dl>
      {r.status === "PENDING_REVIEW" && <p className="muted">El equipo de la plataforma está revisando la solicitud. Te avisaremos por correo.</p>}
      {r.status === "APPROVED" && <p>¡Solicitud aprobada! Revisa tu correo: te enviamos la invitación para crear la cuenta de la parroquia.</p>}
      {r.status === "REJECTED" && r.rejectionReason && <div className="alert err">Motivo: {r.rejectionReason}</div>}
    </section>
  );
}

/** B2: mientras está en revisión, la foto principal se puede agregar o cambiar con el enlace privado. */
function PendingPhoto({ token, r, onUpdated }: { token: string; r: RequestView; onUpdated: (r: RequestView) => void }) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function send() {
    if (!photo) return;
    setBusy(true); setMsg(null);
    try { onUpdated((await sendPhoto(token, photo)).request); setMsg({ ok: true, text: "Foto guardada." }); }
    catch (e) { setMsg({ ok: false, text: text(e) }); } finally { setBusy(false); }
  }
  return (
    <section className="card stack-sm">
      <h2>Foto de la parroquia</h2>
      <p className="muted" style={{ margin: 0 }}>{r.hasPhoto ? "Ya enviaste una foto. Puedes reemplazarla mientras la solicitud está en revisión." : "Todavía no enviaste una foto. Es opcional."}</p>
      {msg && <div className={`alert ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</div>}
      <PhotoCropper disabled={busy} onChange={setPhoto} />
      <button type="button" className="btn btn-primary" disabled={busy || !photo} onClick={() => void send()}>{busy ? "Subiendo…" : r.hasPhoto ? "Reemplazar foto" : "Enviar foto"}</button>
    </section>
  );
}

/** Seguimiento con el enlace privado. El token se quita de la barra de direcciones apenas se lee. */
function Track({ token }: { token: string }) {
  const [r, setR] = useState<RequestView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api<{ request: RequestView }>(`/organization-requests/status?token=${encodeURIComponent(token)}`).then((x) => setR(x.request), (e) => setErr(text(e)));
  }, [token]);

  async function resubmit(body: Record<string, unknown>, photo: Blob | null) {
    setBusy(true); setErr(null); setPhotoMsg(null);
    try {
      setR((await post<{ request: RequestView }>("/organization-requests/resubmit", { token, ...body })).request); setResent(true);
      if (photo) {
        try { setR((await sendPhoto(token, photo)).request); }
        catch (e) { setPhotoMsg({ ok: false, text: `La solicitud se envió, pero la foto no se pudo subir: ${text(e)}` }); }
      }
    }
    catch (e) { setErr(text(e)); } finally { setBusy(false); }
  }

  if (!r && !err) return <div className="acct-loading" role="status">Cargando…</div>;
  if (!r) return (
    <section className="card stack-sm">
      <div className="alert err" role="alert">{err}</div>
      <Link className="btn" href="/solicitud-parroquia">Presentar una solicitud nueva</Link>
    </section>
  );
  return (
    <>
      {resent && <div className="alert ok" role="status">Enviamos la solicitud corregida. Vuelve a quedar en revisión.</div>}
      {photoMsg && <div className={`alert ${photoMsg.ok ? "ok" : "warn"}`} role="status">{photoMsg.text}</div>}
      <StatusCard r={r} />
      {r.status === "PENDING_REVIEW" && <PendingPhoto token={token} r={r} onUpdated={setR} />}
      {r.status === "REJECTED" && (
        <>
          <section className="card stack-sm">
            <h2>Corregir y volver a presentar</h2>
            <p className="muted">Completa de nuevo los datos teniendo en cuenta el motivo. Este mismo enlace te sirve para seguirla.</p>
          </section>
          {err && <div className="alert err" role="alert">{err}</div>}
          <RequestForm initial={{ parishName: r.parishName }} withTerms={false} submitLabel="Volver a presentar" busy={busy} onSubmit={resubmit} />
        </>
      )}
    </>
  );
}

function NewRequest() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ request: RequestView; trackingUrl: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  async function create(body: Record<string, unknown>, photo: Blob | null) {
    setBusy(true); setErr(null); setPhotoErr(null);
    try {
      const res = await post<{ request: RequestView; trackingUrl: string; emailSent: boolean }>("/organization-requests", body);
      // La foto se sube con el token privado que devuelve el alta. Si falla, la solicitud ya quedó guardada.
      const token = new URL(res.trackingUrl, window.location.origin).searchParams.get("token");
      if (photo && token) {
        try { res.request = (await sendPhoto(token, photo)).request; }
        catch (e) { setPhotoErr(text(e)); }
      }
      setDone(res); window.scrollTo(0, 0);
    }
    catch (e) { setErr(text(e)); window.scrollTo(0, 0); } finally { setBusy(false); }
  }

  if (done) return (
    <>
      <div className="alert ok" role="status">Recibimos tu solicitud. La plataforma la revisará y te avisará por correo.</div>
      {photoErr && <div className="alert warn" role="status">La solicitud quedó guardada, pero la foto no se pudo subir: {photoErr} Puedes enviarla desde el enlace de seguimiento.</div>}
      <StatusCard r={done.request} />
      <section className="card stack-sm">
        <h2>Tu enlace de seguimiento</h2>
        {!done.emailSent && <div className="alert warn">No pudimos enviarte el correo. Guarda este enlace ahora: es la única forma de consultar o corregir la solicitud.</div>}
        <p className="muted">Es privado: con él puedes ver el estado y, si la rechazan, corregirla. No lo compartas.</p>
        <div className="copy-box">{done.trackingUrl}</div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => { void copyText(done.trackingUrl); setCopied(true); }}>{copied ? "Copiado" : "Copiar enlace"}</button>
          <a className="btn" href={done.trackingUrl}>Ver estado</a>
        </div>
      </section>
    </>
  );
  return (
    <>
      <section className="card stack-sm">
        <h1 className="acct-title" style={{ margin: 0 }}>Sumar mi parroquia</h1>
        <p className="muted">Completa la solicitud. La plataforma la revisa y, si la aprueba, te envía por correo la invitación para crear la cuenta de administración de la parroquia.</p>
      </section>
      {err && <div className="alert err" role="alert">{err}</div>}
      <RequestForm withTerms submitLabel="Enviar solicitud" busy={busy} onSubmit={create} />
    </>
  );
}

function Inner() {
  // El token del enlace privado se lee una vez y se quita de la URL (y del historial) sin perderlo.
  const params = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  useEffect(() => { if (token) window.history.replaceState(null, "", window.location.pathname); }, [token]);
  return token ? <Track token={token} /> : <NewRequest />;
}

export default function SolicitudParroquia() {
  return <PublicShell subtitle="Parroquias"><Suspense fallback={<div className="acct-loading">Cargando…</div>}><Inner /></Suspense></PublicShell>;
}
