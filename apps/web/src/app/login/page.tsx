"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="splash">
      <div className="brand">
        <svg width="72" height="72" viewBox="0 0 512 512" aria-hidden="true">
          <path d="M256 40c-86 0-148 66-148 146 0 104 148 286 148 286s148-182 148-286c0-80-62-146-148-146z" fill="#fff" />
          <circle cx="256" cy="186" r="62" fill="#1677FF" />
        </svg>
        <h1>Peregrinos</h1>
        <p>Control de Recorrido</p>
      </div>
      <form onSubmit={onSubmit} noValidate>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="email">Correo</label>
          <input id="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary" disabled={busy || !email || !password}>{busy ? "Entrando…" : "Iniciar sesión"}</button>
        <p className="tagline">Juntos en el camino</p>
      </form>
    </main>
  );
}
