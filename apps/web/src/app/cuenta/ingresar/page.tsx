"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, post } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";

/** Ingreso a la cuenta del peregrino (sesión propia; nunca crea una sesión del personal). */
export default function Ingresar() {
  const router = useRouter();
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resend, setResend] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("reenviar")) setResend(true); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setMsg(null); setUnverified(false);
    try {
      await post("/auth/account/login", f);
      router.replace("/cuenta");
    } catch (e2) {
      if (e2 instanceof ApiError && e2.code === "EMAIL_NOT_VERIFIED") setUnverified(true);
      setErr(errorText(e2));
    } finally { setBusy(false); }
  }
  async function resendLink() {
    setBusy(true); setErr(null);
    try { setMsg((await post<{ message: string }>("/auth/account/resend-verification", { email: f.email })).message); }
    catch (e2) { setErr(errorText(e2)); } finally { setBusy(false); }
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h1 className="acct-title">Ingresar a mi cuenta</h1>
      {msg && <div className="alert ok" role="status">{msg}</div>}
      {err && <div className="alert err" role="alert">{err}</div>}
      <div className="field"><label htmlFor="em">Correo</label><input id="em" type="email" autoComplete="email" value={f.email} onChange={set("email")} /></div>
      {!resend && <div className="field"><label htmlFor="pw">Contraseña</label><input id="pw" type="password" autoComplete="current-password" value={f.password} onChange={set("password")} /></div>}
      {resend || unverified
        ? <button type="button" className="btn" disabled={busy || !f.email} onClick={resendLink}>Enviarme otro enlace de verificación</button>
        : null}
      {!resend && <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={busy || !f.email || !f.password}>{busy ? "Ingresando…" : "Ingresar"}</button>}
      <p className="muted small" style={{ marginTop: 12 }}>
        <Link href="/cuenta/recuperar">Olvidé mi contraseña</Link> · <Link href="/cuenta/registro">Crear una cuenta</Link>
        {resend && <> · <button type="button" className="acct-link" onClick={() => setResend(false)}>Volver a ingresar</button></>}
      </p>
    </form>
  );
}
