"use client";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";
import { api, ApiError, post } from "@/lib/api";
import { ACCESS_LEVELS } from "@peregrinos/shared";

interface Preview { email: string; role: string; organization: string; invitedBy: string; checkpoints: { name: string; eventName: string }[] }

function Inner() {
  // Se lee una sola vez: después se quita de la barra de direcciones (y del historial) sin perderlo.
  const params = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const router = useRouter();
  const [p, setP] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(""); const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false);
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
    <main className="splash">
      <div className="brand"><MapPin size={64} color="#fff" fill="#1677FF" /><h1>Peregrinos</h1><p>Invitación</p></div>
      <form onSubmit={submit} noValidate>
        {err && <div className="error" role="alert">{err}</div>}
        {!p && !err && <div className="spinner" role="status" aria-label="Cargando" />}
        {!p && err && <p style={{ textAlign: "center" }}><a href="/login" style={{ color: "#fff" }}>Ir al ingreso</a></p>}
        {p && (<>
          <p style={{ textAlign: "center", margin: "0 0 18px" }}><b>{p.invitedBy}</b> te invitó a sumarte a <b>{p.organization}</b> como <b>{role}</b>.{p.checkpoints.length > 0 && <><br />Atenderás: {p.checkpoints.map((c) => c.name).join(", ")}.</>}</p>
          <div className="field"><label htmlFor="em">Correo</label><input id="em" value={p.email} disabled /></div>
          <div className="field"><label htmlFor="nm">Tu nombre</label><input id="nm" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></div>
          <div className="field"><label htmlFor="pw">Elige una clave (mínimo 10 caracteres)</label><input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /></div>
          <button className="btn btn-primary" disabled={busy || name.trim().length < 2 || pw.length < 10}>{busy ? "Creando…" : "Crear mi cuenta y entrar"}</button>
        </>)}
      </form>
    </main>
  );
}
export default function Invitacion() { return <Suspense><Inner /></Suspense>; }
