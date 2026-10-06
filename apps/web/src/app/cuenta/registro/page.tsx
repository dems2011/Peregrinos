"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { post } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";

/** Alta de una cuenta de peregrino. Crea su propia persona; el correo queda pendiente de verificación. */
export default function Registro() {
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", documentNumber: "", phone: "", password: "" });
  const [terms, setTerms] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      // La API responde lo mismo exista o no una cuenta (anti-enumeración): se muestra su mensaje tal cual.
      const r = await post<{ message: string }>("/auth/register-pilgrim", { ...f, acceptTerms: terms });
      setDone(r?.message ?? "Si los datos son correctos, te enviamos un correo para continuar.");
    } catch (e2) { setErr(errorText(e2)); } finally { setBusy(false); }
  }
  if (done) return (
    <section className="card stack-sm" role="status">
      <h2>Revisa tu correo</h2>
      <p>{done}</p>
      <p className="muted small">Correo indicado: <b>{f.email}</b>. Abre el enlace del correo para poder ingresar.</p>
      <p className="muted small">¿No te llegó? Revisa la carpeta de spam o <Link href={`/cuenta/ingresar?reenviar=1`}>pide otro enlace</Link>.</p>
    </section>
  );
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h1 className="acct-title">Crear mi cuenta</h1>
      {err && <div className="alert err" role="alert">{err}</div>}
      <div className="field"><label htmlFor="fn">Nombre <span className="req">*</span></label><input id="fn" autoComplete="given-name" value={f.firstName} onChange={set("firstName")} /></div>
      <div className="field"><label htmlFor="ln">Apellido <span className="req">*</span></label><input id="ln" autoComplete="family-name" value={f.lastName} onChange={set("lastName")} /></div>
      <div className="field"><label htmlFor="em">Correo <span className="req">*</span></label><input id="em" type="email" autoComplete="email" value={f.email} onChange={set("email")} /></div>
      <div className="field"><label htmlFor="dn">Documento <span className="req">*</span></label><input id="dn" autoComplete="off" value={f.documentNumber} onChange={set("documentNumber")} /></div>
      <div className="field"><label htmlFor="ph">Teléfono <span className="req">*</span></label><input id="ph" type="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} /></div>
      <div className="field"><label htmlFor="pw">Contraseña <span className="req">*</span></label><input id="pw" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} /><span className="hint">Al menos 10 caracteres.</span></div>
      <label className="check"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> Acepto los términos y condiciones</label>
      <button className="btn btn-primary" disabled={busy || !terms}>{busy ? "Creando…" : "Crear cuenta"}</button>
      <p className="muted small" style={{ marginTop: 12 }}>¿Ya tienes cuenta? <Link href="/login">Ingresar</Link></p>
    </form>
  );
}
