"use client";
import { useState, type FormEvent } from "react";
import { post } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";

/** Cambio de contraseña con la sesión iniciada. Cierra las sesiones de los demás dispositivos. */
export default function CambiarContrasena() {
  const [f, setF] = useState({ currentPassword: "", newPassword: "", repeat: "" });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setOk(false);
    if (f.newPassword !== f.repeat) { setErr("Las contraseñas nuevas no coinciden."); return; }
    setBusy(true);
    try {
      await post("/auth/account/password", { currentPassword: f.currentPassword, newPassword: f.newPassword });
      setOk(true); setF({ currentPassword: "", newPassword: "", repeat: "" });
    } catch (e2) { setErr(errorText(e2)); } finally { setBusy(false); }
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Cambiar contraseña</h2>
      <p className="muted">Al cambiarla, se cierra la sesión en tus otros dispositivos.</p>
      {ok && <div className="alert ok" role="status">Contraseña actualizada.</div>}
      {err && <div className="alert err" role="alert">{err}</div>}
      <div className="field"><label htmlFor="cp">Contraseña actual</label><input id="cp" type="password" autoComplete="current-password" value={f.currentPassword} onChange={set("currentPassword")} /></div>
      <div className="field"><label htmlFor="np">Contraseña nueva</label><input id="np" type="password" autoComplete="new-password" value={f.newPassword} onChange={set("newPassword")} /><span className="hint">Al menos 10 caracteres.</span></div>
      <div className="field"><label htmlFor="rp">Repite la contraseña nueva</label><input id="rp" type="password" autoComplete="new-password" value={f.repeat} onChange={set("repeat")} /></div>
      <button className="btn btn-primary" disabled={busy || !f.currentPassword || f.newPassword.length < 10}>{busy ? "Guardando…" : "Cambiar contraseña"}</button>
    </form>
  );
}
