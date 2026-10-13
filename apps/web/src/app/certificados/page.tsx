"use client";
import { useState, type FormEvent } from "react";
import { CERTIFICATE_STATUS_LABEL, CERTIFICATE_TYPE_LABEL, type CertificateStatus, type CertificateType } from "@peregrinos/shared";
import { post } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { fmtDateTime } from "@/lib/format";
import { PublicShell } from "@/components/PublicShell";

interface Status { trackingCode: string; type: CertificateType; status: CertificateStatus; publicMessage: string | null; createdAt: string; updatedAt: string; parish: string }

/** B5 — Consultar una solicitud de certificado con el código de seguimiento y el correo (nada viaja en la URL). */
export default function ConsultarCertificado() {
  const [code, setCode] = useState(""); const [email, setEmail] = useState("");
  const [r, setR] = useState<Status | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setR(null);
    try { setR(await post<Status>("/public/certificates/lookup", { code: code.trim().toUpperCase(), email: email.trim() })); }
    catch (e2) { setErr(errMsg(e2, "No se pudo consultar.")); } finally { setBusy(false); }
  }
  return (
    <PublicShell subtitle="Certificado">
      <form className="card stack-sm" onSubmit={submit} noValidate>
        <h1 className="acct-title" style={{ margin: 0 }}>Consultar mi solicitud</h1>
        {err && <div className="alert err" role="alert">{err}</div>}
        <div className="field"><label htmlFor="cc">Código de seguimiento</label><input id="cc" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CERT-XXXX-XXXX" autoCapitalize="characters" maxLength={14} /></div>
        <div className="field"><label htmlFor="ce">Correo con el que la pediste</label><input id="ce" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
        <button className="btn btn-primary" disabled={busy || code.trim().length < 14 || !/\S+@\S+\.\S+/.test(email)}>{busy ? "Consultando…" : "Consultar"}</button>
      </form>
      {r && (
        <section className="card stack-sm" aria-live="polite">
          <h2 style={{ margin: 0 }}>{CERTIFICATE_TYPE_LABEL[r.type]} — {r.parish}</h2>
          <p style={{ margin: 0 }}>Estado: <b>{CERTIFICATE_STATUS_LABEL[r.status]}</b></p>
          {r.publicMessage && <div className="alert">{r.publicMessage}</div>}
          <p className="muted small" style={{ margin: 0 }}>Pedida el {fmtDateTime(r.createdAt)} · última novedad el {fmtDateTime(r.updatedAt)}</p>
          <p className="muted small" style={{ margin: 0 }}>Para retirarlo, la parroquia verificará tu identidad.</p>
        </section>
      )}
    </PublicShell>
  );
}
