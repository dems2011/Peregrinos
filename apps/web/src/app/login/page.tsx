"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isMfaChallenge } from "@peregrinos/shared";
import { ApiError, cancelMfaLogin, login, verifyMfaLogin, warmUpApi } from "@/lib/api";
import { ArrowRight } from "lucide-react";
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
  // Despierta el API (Render en reposo) mientras se escriben los datos: "Ingresar" ya no espera el arranque en frío.
  useEffect(() => { void warmUpApi(); }, []);

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
    <main className="splash login">
      <div className="brand">
        <span className="login-mark"><BrandMark size={52} /></span>
        <h1>Peregrinos</h1>
        <p>La Iglesia más cerca de ti</p>
      </div>

      {mfaStep ? (
        <form className="login-card" onSubmit={onSubmitCode} noValidate>
          <h2 className="login-card-title">Verificación en dos pasos</h2>
          {error && <div className="error" role="alert">{error}</div>}
          <p className="login-help">
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
          <button className="btn btn-primary btn-pill" disabled={busy || !codeValid}>{busy ? "Verificando…" : "Verificar"}</button>
          <button type="button" className="btn btn-pill-outline" onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(null); }}>
            {useRecovery ? "Usar la app de verificación" : "Usar un código de recuperación"}
          </button>
          <button type="button" className="btn btn-pill-outline" onClick={() => void backToPassword()}>Volver</button>
        </form>
      ) : (
        <>
          <form className="login-card" onSubmit={onSubmit} noValidate>
            <h2 className="login-card-title">Ingresa a tu cuenta</h2>
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

            <button className="btn btn-primary btn-pill" disabled={busy || !email || !password}>
              {busy ? "Ingresando…" : <>Ingresar <ArrowRight size={20} aria-hidden="true" /></>}
            </button>

            <Link className="login-forgot" href="/cuenta/recuperar">¿Olvidaste tu contraseña?</Link>
          </form>

          <div className="login-links">
            <div className="login-link-card">
              <p>¿Eres peregrino y aún no tienes cuenta?</p>
              <Link href="/cuenta/registro">Crear cuenta</Link>
            </div>
            <div className="login-link-card">
              <p>¿Tu parroquia todavía no está en Peregrinos?</p>
              <Link href="/solicitud-parroquia">Registrar mi parroquia</Link>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
