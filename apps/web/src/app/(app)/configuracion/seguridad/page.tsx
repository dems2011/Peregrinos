"use client";
import { useState, type FormEvent } from "react";
import type { MeResponse } from "@peregrinos/shared";
import { ApiError, post } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { copyText, ErrorBox, Page } from "@/components/ui";

interface EnrollStart { secret: string; otpauthUrl: string; qrSvg: string; expiresInMinutes: number }

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.details?.map((d) => d.message).join(". ") || e.message : fallback);

/**
 * A6 — Verificación en dos pasos (TOTP) de la cuenta del personal: enrolar, códigos de recuperación y baja.
 * Obligatoria para SUPERADMIN: mientras no la active, el panel solo muestra esta pantalla.
 */
export default function Seguridad() {
  const { me, reloadMe, setMe } = useApp();
  const mfa = me.mfa;
  const [codes, setCodes] = useState<string[] | null>(null);

  if (codes) return <RecoveryCodes codes={codes} onDone={() => { setCodes(null); void reloadMe(); }} />;

  return (
    <Page title="Seguridad de la cuenta" back={mfa.enrollmentRequired ? undefined : "/configuracion"}>
      {mfa.enrollmentRequired && (
        <div className="alert warn" role="alert">
          Tu rol de superadministrador exige la verificación en dos pasos. Actívala para continuar usando el panel.
        </div>
      )}
      {mfa.enabled
        ? <Enabled me={me} onCodes={setCodes} onDisabled={(m) => setMe(m)} />
        : <Enroll onEnabled={(c) => setCodes(c)} />}
    </Page>
  );
}

function Enroll({ onEnabled }: { onEnabled: (codes: string[]) => void }) {
  const [password, setPassword] = useState("");
  const [start, setStart] = useState<EnrollStart | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { setStart(await post<EnrollStart>("/auth/mfa/enroll/start", { password })); setPassword(""); }
    catch (e) { setErr(msg(e, "No se pudo iniciar la activación.")); }
    finally { setBusy(false); }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await post<{ recoveryCodes: string[]; me: MeResponse }>("/auth/mfa/enroll/confirm", { code: code.replace(/\s/g, "") });
      onEnabled(r.recoveryCodes);
    } catch (e) {
      setCode("");
      if (e instanceof ApiError && e.code === "MFA_ENROLL_EXPIRED") setStart(null);
      setErr(msg(e, "No se pudo confirmar el código."));
    } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="sec-title">Verificación en dos pasos: desactivada</div>
      <ErrorBox msg={err} />
      {!start ? (
        <form onSubmit={begin}>
          <p className="muted small">
            Además de tu contraseña, se te pedirá un código de una app de verificación (Google Authenticator, Microsoft
            Authenticator, 1Password, Aegis…). Confirma tu contraseña para empezar.
          </p>
          <div className="field">
            <label htmlFor="mfa-pw">Contraseña</label>
            <input id="mfa-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={busy || !password}>{busy ? "Preparando…" : "Activar verificación en dos pasos"}</button>
        </form>
      ) : (
        <form onSubmit={confirm}>
          <p className="muted small">1. Escanea este código con tu app de verificación.</p>
          {/* SVG generado por la API; como <img> no puede ejecutar nada. */}
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(start.qrSvg)}`}
            alt="Código QR para la app de verificación"
            width={220}
            height={220}
            style={{ display: "block", margin: "8px auto", background: "#fff", padding: 8, borderRadius: 8 }}
          />
          <p className="muted small">¿No puedes escanear? Ingresa esta clave en la app:</p>
          <div className="copy-box" style={{ fontFamily: "monospace", letterSpacing: 1, wordBreak: "break-all" }}>
            {start.secret.match(/.{1,4}/g)?.join(" ")}
          </div>
          <button type="button" className="btn btn-sm" onClick={() => copyText(start.secret)}>Copiar clave</button>
          <p className="muted small" style={{ marginTop: 16 }}>2. Ingresa el código de 6 dígitos que muestra la app (vence en {start.expiresInMinutes} minutos).</p>
          <div className="field">
            <label htmlFor="mfa-confirm">Código de verificación</label>
            <input id="mfa-confirm" autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={busy || !/^\d{6}$/.test(code.replace(/\s/g, ""))}>{busy ? "Verificando…" : "Confirmar y activar"}</button>
        </form>
      )}
    </div>
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
        <button className="btn" onClick={() => copyText(text)}>Copiar</button>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => {
          const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
          const a = document.createElement("a"); a.href = url; a.download = "peregrinos-codigos-recuperacion.txt";
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }}>Descargar</button>
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> Ya guardé mis códigos
        </label>
        <button className="btn btn-primary" disabled={!saved} onClick={onDone}>Continuar</button>
      </div>
    </Page>
  );
}
