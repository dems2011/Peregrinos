"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, post } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";

/**
 * Elegir una contraseña nueva. El token llega en el fragmento (#token=…): el navegador no lo envía al servidor web.
 * Se quita de la barra de direcciones apenas se lee y viaja a la API solo en el cuerpo de la petición.
 */
export default function Restablecer() {
  const [token, setToken] = useState<string | null>(null);
  const [f, setF] = useState({ password: "", repeat: "" });
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("token");
    setToken(t ?? "");
    if (t) window.history.replaceState(null, "", window.location.pathname);
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (f.password !== f.repeat) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try { await post("/auth/account/password-reset/confirm", { token, password: f.password }); setDone(true); }
    catch (e2) { setErr(errorText(e2)); setExpired(e2 instanceof ApiError && e2.code === "INVALID_RESET_TOKEN"); } finally { setBusy(false); }
  }
  if (token === null) return <div className="acct-loading">Cargando…</div>;
  if (done) return (
    <section className="card stack-sm" role="status">
      <h2>Contraseña actualizada</h2>
      <p>Por seguridad cerramos todas tus sesiones. Ingresa con tu contraseña nueva.</p>
      <Link className="btn btn-primary" href="/login">Ingresar</Link>
    </section>
  );
  if (!token) return (
    <section className="card stack-sm">
      <h2>Enlace incompleto</h2>
      <p className="muted">Abre el enlace completo que te enviamos por correo, o pide uno nuevo.</p>
      <Link className="btn" href="/cuenta/recuperar">Pedir un enlace nuevo</Link>
    </section>
  );
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h1 className="acct-title">Elegir contraseña nueva</h1>
      {err && <div className="alert err" role="alert">{err}{expired && <> <Link href="/cuenta/recuperar">Pedir otro enlace</Link></>}</div>}
      <div className="field"><label htmlFor="np">Contraseña nueva</label><input id="np" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><span className="hint">Al menos 10 caracteres.</span></div>
      <div className="field"><label htmlFor="rp">Repite la contraseña</label><input id="rp" type="password" autoComplete="new-password" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} /></div>
      <button className="btn btn-primary" disabled={busy || f.password.length < 10}>{busy ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
  );
}
