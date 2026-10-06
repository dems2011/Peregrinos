"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { post } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";

/**
 * El ingreso es único (/login). Esta ruta queda para reenviar el correo de verificación (?reenviar=1) y para los
 * enlaces antiguos (correos ya enviados, marcadores): sin ?reenviar redirige al login.
 */
export default function Ingresar() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "resend">("loading");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reenviar")) setMode("resend");
    else router.replace("/login");
  }, [router]);

  async function resend(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { setMsg((await post<{ message: string }>("/auth/account/resend-verification", { email })).message); }
    catch (e2) { setErr(errorText(e2)); } finally { setBusy(false); }
  }

  if (mode === "loading") return <div className="acct-loading" role="status">Cargando…</div>;
  return (
    <form className="card" onSubmit={resend} noValidate>
      <h1 className="acct-title">Reenviar verificación</h1>
      <p className="muted">Escribe el correo de tu cuenta y te enviaremos un enlace nuevo para verificarlo.</p>
      {msg && <div className="alert ok" role="status">{msg}</div>}
      {err && <div className="alert err" role="alert">{err}</div>}
      <div className="field"><label htmlFor="em">Correo</label><input id="em" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <button className="btn btn-primary" disabled={busy || !email}>{busy ? "Enviando…" : "Enviarme otro enlace"}</button>
      <p className="muted small" style={{ marginTop: 12 }}><Link href="/login">Volver a ingresar</Link></p>
    </form>
  );
}
