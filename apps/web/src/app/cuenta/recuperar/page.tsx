"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { post } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";

/** Pedido de recuperación: la respuesta es la misma exista o no la cuenta. */
export default function Recuperar() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { setMsg((await post<{ message: string }>("/auth/account/password-reset/request", { email })).message); }
    catch (e2) { setErr(errorText(e2)); } finally { setBusy(false); }
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h1 className="acct-title">Recuperar mi contraseña</h1>
      <p className="muted">Escribe el correo de tu cuenta. Si existe, te enviaremos un enlace para elegir una contraseña nueva (vence en 30 minutos).</p>
      {msg && <div className="alert ok" role="status">{msg}</div>}
      {err && <div className="alert err" role="alert">{err}</div>}
      <div className="field"><label htmlFor="em">Correo</label><input id="em" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <button className="btn btn-primary" disabled={busy || !email}>{busy ? "Enviando…" : "Enviarme el enlace"}</button>
      <p className="muted small" style={{ marginTop: 12 }}><Link href="/cuenta/ingresar">Volver a ingresar</Link></p>
    </form>
  );
}
