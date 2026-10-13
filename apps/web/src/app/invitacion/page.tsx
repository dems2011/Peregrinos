"use client";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { SplashBackground } from "@/components/SplashBackground";
import { api, ApiError, post } from "@/lib/api";
import { ACCESS_LEVELS, PERMISSION_CATALOG } from "@peregrinos/shared";

interface Preview { email: string; role: string; organization: string; invitedBy: string; checkpoints: { name: string; eventName: string }[]; permissions?: string[] }

function Inner() {
  // Se lee una sola vez: después se quita de la barra de direcciones (y del historial) sin perderlo.
  const params = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const router = useRouter();
  const [p, setP] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(""); const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);
  /** B5: rechazar no crea cuenta ni concede nada; el enlace deja de servir y queda registrado para quien invitó. */
  async function decline() {
    if (!confirm("¿Rechazar la invitación? El enlace dejará de servir.")) return;
    setBusy(true); setErr(null);
    try { await post("/invitations/decline", { token }); setDeclined(true); }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "No se pudo rechazar la invitación."); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!token) return setErr("Falta el enlace de la invitación.");
    window.history.replaceState(null, "", window.location.pathname);
    api<Preview>(`/invitations/preview?token=${encodeURIComponent(token)}`).then(setP).catch((e) => setErr(e instanceof ApiError ? e.message : "No se pudo abrir la invitación."));
  }, [token]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await post("/invitations/accept", { token, name, password: pw }); router.replace("/"); }
    catch (e2) { setErr(e2 instanceof ApiError ? (e2.details?.map((d) => d.message).join(". ") || e2.message) : "No se pudo crear la cuenta."); } finally { setBusy(false); }
  }
  const role = p && (ACCESS_LEVELS.find((l) => l.role === p.role)?.label ?? p.role);
  return (
    <main className="splash photo">
      <SplashBackground />
      <div className="brand"><BrandMark size={64} /><h1>Peregrinos</h1><p>Invitación</p></div>
      <form onSubmit={submit} noValidate>
        {err && <div className="error" role="alert">{err}</div>}
        {!p && !err && <div className="spinner" role="status" aria-label="Cargando" />}
        {!p && err && <p style={{ textAlign: "center" }}><a href="/login" style={{ color: "#fff" }}>Ir al ingreso</a></p>}
        {declined && <p style={{ textAlign: "center" }}>Rechazaste la invitación. No se creó ninguna cuenta.<br /><a href="/login" style={{ color: "#fff" }}>Ir al ingreso</a></p>}
        {p && !declined && (<>
          <p style={{ textAlign: "center", margin: "0 0 18px" }}><b>{p.invitedBy}</b> te invitó a sumarte a <b>{p.organization}</b> como <b>{role}</b>.{p.checkpoints.length > 0 && <><br />Atenderás: {p.checkpoints.map((c) => c.name).join(", ")}.</>}</p>
          {!!p.permissions?.length && (
            <p style={{ margin: "0 0 18px" }}>Además podrás: {PERMISSION_CATALOG.filter((c) => p.permissions!.includes(c.id)).map((c) => c.label.toLowerCase()).join(", ")}.</p>
          )}
          <div className="field"><label htmlFor="em">Correo</label><input id="em" value={p.email} disabled /></div>
          <div className="field"><label htmlFor="nm">Tu nombre</label><input id="nm" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></div>
          <div className="field"><label htmlFor="pw">Elige una clave (mínimo 10 caracteres)</label><input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /></div>
          <button className="btn btn-primary" disabled={busy || name.trim().length < 2 || pw.length < 10}>{busy ? "Creando…" : "Aceptar: crear mi cuenta y entrar"}</button>
          <button type="button" className="btn btn-pill-outline" disabled={busy} onClick={() => void decline()} style={{ marginTop: 10 }}>Rechazar la invitación</button>
        </>)}
      </form>
    </main>
  );
}
export default function Invitacion() { return <Suspense><Inner /></Suspense>; }
