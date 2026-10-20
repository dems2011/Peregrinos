"use client";
import { useState, type FormEvent } from "react";
import type { MeResponse } from "@peregrinos/shared";
import { ApiError, canSaveFile, post } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { copyText, ErrorBox, Page } from "@/components/ui";

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.details?.map((d) => d.message).join(". ") || e.message : fallback);

/**
 * Seguridad de la cuenta del personal: cambio de contraseña (recuperación desde el login). El superadministrador entra
 * con usuario y contraseña, sin verificación en dos pasos. A6 — Si otra cuenta del personal ya tiene la verificación en
 * dos pasos (TOTP) activa, aquí la gestiona o la desactiva.
 */
export default function Seguridad() {
  const { me, reloadMe, setMe } = useApp();
  const mfa = me.mfa;
  const [codes, setCodes] = useState<string[] | null>(null);

  if (codes) return <RecoveryCodes codes={codes} onDone={() => { setCodes(null); void reloadMe(); }} />;

  return (
    <Page title="Seguridad de la cuenta" back="/configuracion">
      <ChangePassword />
      {mfa.enabled && <Enabled me={me} onCodes={setCodes} onDisabled={(m) => setMe(m)} />}
    </Page>
  );
}

/** Cambio de la propia contraseña (cierra las demás sesiones). Si la olvidaste: «¿Olvidaste tu contraseña?» en el ingreso. */
function ChangePassword() {
  const [f, setF] = useState({ currentPassword: "", newPassword: "", repeat: "" });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setOk(null);
    if (f.newPassword !== f.repeat) { setErr("Las contraseñas nuevas no coinciden."); return; }
    setBusy(true);
    try {
      const r = await post<{ message: string }>("/auth/password", { currentPassword: f.currentPassword, newPassword: f.newPassword });
      setOk(r.message); setF({ currentPassword: "", newPassword: "", repeat: "" });
    } catch (e2) { setErr(msg(e2, "No se pudo cambiar la contraseña.")); } finally { setBusy(false); }
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="sec-title">Cambiar contraseña</div>
      <p className="muted small">Al cambiarla se cierran tus sesiones en otros dispositivos. Si la olvidaste, usa «¿Olvidaste tu contraseña?» en la pantalla de ingreso.</p>
      {ok && <div className="alert ok" role="status">{ok}</div>}
      <ErrorBox msg={err} />
      <div className="field"><label htmlFor="cp">Contraseña actual</label><input id="cp" type="password" autoComplete="current-password" value={f.currentPassword} onChange={set("currentPassword")} /></div>
      <div className="field"><label htmlFor="np">Contraseña nueva</label><input id="np" type="password" autoComplete="new-password" value={f.newPassword} onChange={set("newPassword")} /><span className="hint">Al menos 10 caracteres.</span></div>
      <div className="field"><label htmlFor="rp">Repite la contraseña nueva</label><input id="rp" type="password" autoComplete="new-password" value={f.repeat} onChange={set("repeat")} /></div>
      <button className="btn btn-primary" disabled={busy || !f.currentPassword || f.newPassword.length < 10}>{busy ? "Guardando…" : "Cambiar contraseña"}</button>
    </form>
  );
}

function Enabled({ me, onCodes, onDisabled }: { me: MeResponse; onCodes: (c: string[]) => void; onDisabled: (m: MeResponse) => void }) {
  const [action, setAction] = useState<"codes" | "disable" | null>(null);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSuperadmin = me.user.role === "SUPERADMIN";

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      // Ambas acciones exigen step-up: si hace falta, el cliente abre el diálogo y reintenta solo.
      if (action === "codes") onCodes((await post<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes", { password })).recoveryCodes);
      else onDisabled(await post<MeResponse>("/auth/mfa/disable", { password }));
      setAction(null); setPassword("");
    } catch (e) { setErr(msg(e, "No se pudo completar la acción.")); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="sec-title">Verificación en dos pasos: activada</div>
      <p className="muted small">
        Códigos de recuperación disponibles: <strong>{me.mfa.recoveryCodesRemaining}</strong>.
        {me.mfa.recoveryCodesRemaining <= 3 && " Te quedan pocos: genera nuevos."}
      </p>
      <ErrorBox msg={err} />
      {!action ? (
        <>
          <button className="btn" onClick={() => setAction("codes")}>Generar nuevos códigos de recuperación</button>
          {isSuperadmin
            ? <p className="muted small" style={{ marginTop: 12 }}>Es obligatoria para tu rol. Si cambias de teléfono, otro superadministrador puede restablecerla.</p>
            : <button className="btn" style={{ marginTop: 10 }} onClick={() => setAction("disable")}>Desactivar verificación en dos pasos</button>}
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="muted small">
            {action === "codes"
              ? "Los códigos anteriores dejarán de funcionar."
              : "Se cerrarán tus otras sesiones y tu cuenta quedará protegida solo con la contraseña."}
          </p>
          <div className="field">
            <label htmlFor="mfa-pw2">Contraseña</label>
            <input id="mfa-pw2" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className={`btn ${action === "disable" ? "btn-danger" : "btn-primary"}`} disabled={busy || !password}>
            {busy ? "Procesando…" : action === "codes" ? "Generar códigos" : "Desactivar"}
          </button>
          <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => { setAction(null); setPassword(""); setErr(null); }}>Cancelar</button>
        </form>
      )}
    </div>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  const FILE = "peregrinos-codigos-recuperacion.txt";
  const canDownload = canSaveFile(FILE);
  const text = `Peregrinos — códigos de recuperación\nCada código sirve una sola vez.\n\n${codes.join("\n")}\n`;
  return (
    <Page title="Códigos de recuperación">
      <div className="card">
        <div className="alert warn">
          Guárdalos en un lugar seguro. Sirven para entrar si pierdes el teléfono. No se volverán a mostrar.
        </div>
        <ul style={{ fontFamily: "monospace", fontSize: 16, columns: 2, listStyle: "none", padding: 0 }}>
          {codes.map((c) => <li key={c} style={{ padding: "4px 0" }}>{c}</li>)}
        </ul>
        <button className="btn" onClick={() => void copyText(text).then(setCopied)}>Copiar</button>
        {copied === true && <p className="small" role="status">Copiados. Pégalos en un lugar seguro (por ejemplo, una nota protegida o impresos).</p>}
        {copied === false && <p className="small" role="alert">No se pudieron copiar: anótalos a mano antes de continuar.</p>}
        {!canDownload
          ? <p className="small muted" style={{ marginTop: 10 }}>Esta versión de la aplicación no puede guardarlos como archivo: usa «Copiar» o anótalos.</p>
          : <button className="btn" style={{ marginTop: 10 }} onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            const a = document.createElement("a"); a.href = url; a.download = FILE;
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
          }}>Descargar</button>}
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> Ya guardé mis códigos
        </label>
        <button className="btn btn-primary" disabled={!saved} onClick={onDone}>Continuar</button>
      </div>
    </Page>
  );
}
