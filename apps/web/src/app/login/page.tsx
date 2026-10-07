"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isMfaChallenge } from "@peregrinos/shared";
import { ApiError, cancelMfaLogin, login, verifyMfaLogin } from "@/lib/api";
import { BrandMark } from "@/components/BrandMark";

/**
 * Ingreso único: el mismo formulario sirve al personal (con MFA si lo tiene activo) y a las cuentas de peregrino
 * (la API abre la sesión de su cuenta y se va a /cuenta). No hay una pantalla intermedia para "ingresar a mi cuenta".
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);
  // A6: segundo paso del login (cuentas con verificación en dos pasos).
  const [mfaStep, setMfaStep] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const codeValid = useRecovery ? code.replace(/[^A-Za-z0-9]/g, "").length === 10 : /^\d{6}$/.test(code.replace(/\s/g, ""));

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyMfaLogin(useRecovery ? { recoveryCode: code.trim() } : { code: code.replace(/\s/g, "") });
      router.replace("/");
    } catch (err) {
      setCode("");
      if (err instanceof ApiError && err.status === 401) {
        // El desafío venció (5 minutos): se vuelve a la contraseña.
        setMfaStep(false);
        setPassword("");
      }
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  async function backToPassword() {
    await cancelMfaLogin().catch(() => undefined);
    setMfaStep(false); setCode(""); setPassword(""); setError(null); setUseRecovery(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUnverified(false);
    try {
      const r = await login(email, password);
      if (isMfaChallenge(r)) {
        setMfaStep(true);
        return;
      }
      // A5.0: con credenciales de peregrino la API abre la sesión de su cuenta (no la del personal): va a /cuenta.
      router.replace((r as { kind?: string }).kind === "pilgrim" ? "/cuenta" : "/");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "No se pudo conectar con el servidor.";
      // La API solo avisa "verifica tu correo" con la contraseña correcta de una cuenta de peregrino sin verificar.
      setUnverified(/verificar tu correo/i.test(message));
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="splash">
      <div className="brand">
        <BrandMark size={76} />
        <h1>Peregrinos</h1>
        <p>La Iglesia más cerca de ti</p>
      </div>

      {mfaStep ? (
        <form onSubmit={onSubmitCode} noValidate>
          {error && <div className="error" role="alert">{error}</div>}
          <p className="muted-on-blue" style={{ margin: "0 0 12px" }}>
            {useRecovery
              ? "Ingresa uno de tus códigos de recuperación. Cada código sirve una sola vez."
              : "Ingresa el código de 6 dígitos de tu app de verificación."}
          </p>
          <div className="field">
            <label htmlFor="mfa-code">{useRecovery ? "Código de recuperación" : "Código de verificación"}</label>
            <input
              id="mfa-code" autoFocus autoComplete="one-time-code" inputMode={useRecovery ? "text" : "numeric"}
              maxLength={useRecovery ? 14 : 7} value={code} onChange={(e) => setCode(e.target.value)} required
            />
          </div>
          <button className="btn btn-primary" disabled={busy || !codeValid}>{busy ? "Verificando…" : "Verificar"}</button>
          <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(null); }}>
            {useRecovery ? "Usar la app de verificación" : "Usar un código de recuperación"}
          </button>
          <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => void backToPassword()}>Volver</button>
        </form>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {error && (
            <div className="error" role="alert">
              {error}
              {unverified && <> <Link href="/cuenta/ingresar?reenviar=1">Reenviar el enlace de verificación</Link></>}
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Correo</label>
            <input id="email" type="email" autoComplete="username" inputMode="email" placeholder="tu@correo.com"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button className="btn btn-primary" disabled={busy || !email || !password}>{busy ? "Ingresando…" : "Ingresar"}</button>

          <div className="links">
            <Link className="link-on-blue" href="/cuenta/recuperar">¿Olvidaste tu contraseña?</Link>
            <div>
              <p className="muted-on-blue" style={{ margin: "0 0 6px" }}>¿Eres peregrino y aún no tienes cuenta?</p>
              <Link className="link-on-blue" href="/cuenta/registro">Crear cuenta</Link>
            </div>
            <div>
              <p className="muted-on-blue" style={{ margin: "0 0 6px" }}>¿Tu parroquia todavía no está en Peregrinos?</p>
              <Link className="link-on-blue" href="/solicitud-parroquia">Registrar mi parroquia</Link>
            </div>
            <Link className="link-on-blue" href="/parroquias">Buscar una parroquia</Link>
          </div>
        </form>
      )}
    </main>
  );
}
