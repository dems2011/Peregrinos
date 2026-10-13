"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CERTIFICATE_TYPES, CERTIFICATE_TYPE_LABEL, type CertificateType } from "@peregrinos/shared";
import { api, post } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useLoad } from "@/lib/hooks";
import { PublicShell } from "@/components/PublicShell";
import { copyText } from "@/components/ui";

const empty = {
  type: "BAPTISM" as CertificateType, requesterName: "", requesterEmail: "", requesterPhone: "", requesterDocument: "", subjectName: "",
  subjectBirthDate: "", sacramentYear: "", sacramentPlace: "", parentsNames: "", spouseName: "", purpose: "", details: "", website: "",
};

/**
 * B5 — Pedir un certificado o partida sacramental a una parroquia. Solo los datos necesarios para encontrarla en los
 * libros. La parroquia la entrega verificando la identidad; Peregrinos solo gestiona el pedido y su seguimiento.
 */
export default function PedirCertificado() {
  const { id } = useParams<{ id: string }>();
  const parish = useLoad(() => api<{ parish: { name: string } }>(`/public/parishes/${id}`), [id]);
  const [f, setF] = useState(empty); const [privacy, setPrivacy] = useState(false);
  const [done, setDone] = useState<{ code: string; emailSent: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const opt = (v: string) => v.trim() || null;
    try {
      const r = await post<{ trackingCode: string; emailSent: boolean }>(`/public/parishes/${id}/certificates`, {
        type: f.type, requesterName: f.requesterName, requesterEmail: f.requesterEmail, requesterPhone: opt(f.requesterPhone), requesterDocument: opt(f.requesterDocument),
        subjectName: f.subjectName, subjectBirthDate: opt(f.subjectBirthDate), sacramentYear: f.sacramentYear ? Number(f.sacramentYear) : null,
        sacramentPlace: opt(f.sacramentPlace), parentsNames: opt(f.parentsNames), spouseName: f.type === "MARRIAGE" ? opt(f.spouseName) : null,
        purpose: opt(f.purpose), details: opt(f.details), acceptPrivacy: privacy, ...(f.website ? { website: f.website } : {}),
      });
      setDone({ code: r.trackingCode, emailSent: r.emailSent });
    } catch (e2) { setErr(errMsg(e2, "No se pudo enviar la solicitud.")); } finally { setBusy(false); }
  }

  if (done) return (
    <PublicShell subtitle="Certificado">
      <section className="card stack-sm">
        <h1 className="acct-title" style={{ margin: 0 }}>Recibimos tu solicitud</h1>
        <p style={{ margin: 0 }}>Tu código de seguimiento es:</p>
        <p className="copy-box" style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, textAlign: "center" }}>{done.code}</p>
        <button className="btn" onClick={() => copyText(done.code)}>Copiar el código</button>
        <p className="small" style={{ margin: 0 }}>Guárdalo: con este código y tu correo puedes consultar el estado. {done.emailSent ? "También te lo enviamos por correo." : "No pudimos enviarte el correo: anota el código."}</p>
        <p className="muted small" style={{ margin: 0 }}>Para retirar el certificado la parroquia verificará tu identidad.</p>
        <Link className="btn btn-primary" href="/certificados">Consultar el estado</Link>
      </section>
    </PublicShell>
  );

  return (
    <PublicShell subtitle="Certificado">
      <form className="card stack-sm" onSubmit={submit} noValidate>
        <h1 className="acct-title" style={{ margin: 0 }}>Pedir un certificado</h1>
        <p className="muted" style={{ margin: 0 }}>{parish.data?.parish.name ?? "Parroquia"}. Completa los datos para que la parroquia encuentre el registro en sus libros.</p>
        {err && <div className="alert err" role="alert">{err}</div>}
        <div className="field"><label htmlFor="ct">Tipo de certificado</label><select id="ct" value={f.type} onChange={set("type")}>{CERTIFICATE_TYPES.map((t) => <option key={t} value={t}>{CERTIFICATE_TYPE_LABEL[t]}</option>)}</select></div>
        <h2 style={{ margin: "8px 0 0", fontSize: 16 }}>Persona del certificado</h2>
        <div className="field"><label htmlFor="cs">Nombre completo</label><input id="cs" value={f.subjectName} maxLength={160} onChange={set("subjectName")} autoComplete="off" /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="cb">Fecha de nacimiento (opcional)</label><input id="cb" type="date" value={f.subjectBirthDate} onChange={set("subjectBirthDate")} /></div>
          <div className="field"><label htmlFor="cy">Año aproximado del sacramento</label><input id="cy" inputMode="numeric" maxLength={4} value={f.sacramentYear} onChange={set("sacramentYear")} /></div>
        </div>
        <div className="field"><label htmlFor="cpl">Lugar o templo (opcional)</label><input id="cpl" value={f.sacramentPlace} maxLength={160} onChange={set("sacramentPlace")} /></div>
        {f.type !== "MARRIAGE" && <div className="field"><label htmlFor="cpa">Nombres de los padres (opcional)</label><input id="cpa" value={f.parentsNames} maxLength={240} onChange={set("parentsNames")} /></div>}
        {f.type === "MARRIAGE" && <div className="field"><label htmlFor="csp">Nombre del cónyuge</label><input id="csp" value={f.spouseName} maxLength={160} onChange={set("spouseName")} /></div>}
        <div className="field"><label htmlFor="cpu">¿Para qué lo necesitas? (opcional)</label><input id="cpu" value={f.purpose} maxLength={240} onChange={set("purpose")} placeholder="Ej.: casamiento, padrinazgo" /></div>
        <div className="field"><label htmlFor="cde">Otros datos útiles (opcional)</label><textarea id="cde" value={f.details} maxLength={1500} onChange={set("details")} /></div>
        <h2 style={{ margin: "8px 0 0", fontSize: 16 }}>Tus datos de contacto</h2>
        <div className="field"><label htmlFor="rn">Tu nombre</label><input id="rn" value={f.requesterName} maxLength={120} onChange={set("requesterName")} autoComplete="name" /></div>
        <div className="field"><label htmlFor="re">Tu correo</label><input id="re" type="email" value={f.requesterEmail} maxLength={200} onChange={set("requesterEmail")} autoComplete="email" /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="rp">Teléfono (opcional)</label><input id="rp" value={f.requesterPhone} maxLength={40} onChange={set("requesterPhone")} autoComplete="tel" /></div>
          <div className="field"><label htmlFor="rd">Documento (opcional)</label><input id="rd" value={f.requesterDocument} maxLength={30} onChange={set("requesterDocument")} /></div>
        </div>
        {/* Trampa anti-spam: invisible para las personas. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}><label>Sitio web<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label></div>
        <label className="check"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} /> Acepto que la parroquia use estos datos solo para atender esta solicitud.</label>
        <button className="btn btn-primary" disabled={busy || !privacy || f.subjectName.trim().length < 3 || f.requesterName.trim().length < 3 || !/\S+@\S+\.\S+/.test(f.requesterEmail)}>{busy ? "Enviando…" : "Enviar solicitud"}</button>
        <p className="muted small" style={{ margin: 0 }}>Peregrinos gestiona tu pedido; el certificado lo emite la parroquia según sus libros sacramentales.</p>
      </form>
    </PublicShell>
  );
}
