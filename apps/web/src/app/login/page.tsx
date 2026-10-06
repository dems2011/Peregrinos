"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isMfaChallenge } from "@peregrinos/shared";
import { ApiError, cancelMfaLogin, login, verifyMfaLogin } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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

    try {
      const r = await login(email, password);
      if (isMfaChallenge(r)) {
        setMfaStep(true);
        return;
      }
      // A5.0: con credenciales de peregrino la API abre la sesión de su cuenta (no la del personal): va a /cuenta.
      router.replace((r as { kind?: string }).kind === "pilgrim" ? "/cuenta" : "/");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo conectar con el servidor."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="splash">
      <div className="brand">
        <svg
          width="72"
          height="72"
          viewBox="0 0 512 512"
          aria-hidden="true"
        >
          <path
            d="M256 40c-86 0-148 66-148 146 0 104 148 286 148 286s148-182 148-286c0-80-62-146-148-146z"
            fill="#fff"
          />
          <circle
            cx="256"
            cy="186"
            r="62"
            fill="#1677FF"
          />
        </svg>

        <h1>Peregrinos</h1>
        <p>Control de Recorrido</p>
      </div>

      {mfaStep ? (
        <form onSubmit={onSubmitCode} noValidate>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <p style={{ margin: "0 0 12px", fontSize: "14px" }}>
            {useRecovery
              ? "Ingresa uno de tus códigos de recuperación. Cada código sirve una sola vez."
              : "Ingresa el código de 6 dígitos de tu app de verificación."}
          </p>
          <div className="field">
            <label htmlFor="mfa-code">{useRecovery ? "Código de recuperación" : "Código de verificación"}</label>
            <input
              id="mfa-code"
              autoFocus
              autoComplete="one-time-code"
              inputMode={useRecovery ? "text" : "numeric"}
              maxLength={useRecovery ? 14 : 7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" disabled={busy || !codeValid}>
            {busy ? "Verificando…" : "Verificar"}
          </button>
          <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(null); }}>
            {useRecovery ? "Usar la app de verificación" : "Usar un código de recuperación"}
          </button>
          <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => void backToPassword()}>
            Volver
          </button>
        </form>
      ) : (
      <form onSubmit={onSubmit} noValidate>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Correo</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button
          className="btn btn-primary"
          disabled={busy || !email || !password}
        >
          {busy ? "Entrando…" : "Iniciar sesión"}
        </button>

        <div
          style={{
            textAlign: "center",
            marginTop: "22px",
            color: "#111827",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: "14px",
              color: "#111827",
            }}
          >
            ¿Eres peregrino y todavía no tienes una cuenta?
          </p>

          {/* /registrar es la pantalla de llegadas del personal; el alta del peregrino es /cuenta/registro. */}
          <a
            href="/cuenta/registro"
            style={{
              color: "#1677FF",
              fontWeight: 700,
              textDecoration: "none",
              fontSize: "15px",
            }}
          >
            Crear cuenta de peregrino
          </a>
          <p style={{ margin: "10px 0 0", fontSize: "14px", color: "#111827" }}>
            ¿Ya tienes cuenta de peregrino?{" "}
            <a href="/cuenta/ingresar" style={{ color: "#1677FF", fontWeight: 700, textDecoration: "none" }}>Ingresar a mi cuenta</a>
          </p>
          <p style={{ margin: "10px 0 0", fontSize: "14px", color: "#111827" }}>
            ¿Tu parroquia todavía no usa Peregrinos?{" "}
            <a href="/solicitud-parroquia" style={{ color: "#1677FF", fontWeight: 700, textDecoration: "none" }}>Solicitar el alta</a>
          </p>
        </div>

        <p className="tagline">Juntos en el camino</p>
      </form>
      )}
    </main>
  );
}