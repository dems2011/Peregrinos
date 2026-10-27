"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { PILGRIM_REQUEST_STATUS_LABEL, type PilgrimRequestStatus } from "@peregrinos/shared";
import { api, ApiError, post } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDateTimeMedium, viewerTimeZone } from "@/lib/format";

/**
 * Solicitudes a la parroquia (2026-10-27): bautismo, constancias, intenciones… según los trámites que cada parroquia
 * habilitó en SIGyP. La parroquia la recibe en su sistema y el estado vuelve aquí. Solo los ve esta cuenta.
 */
interface Followed { id: string; name: string }
interface RequestType { id: string; name: string; description: string }
interface Mine { id: string; typeName: string; description: string; status: PilgrimRequestStatus; number: string | null; message: string | null; createdAt: string; updatedAt: string; organization: { id: string; name: string } }
const FINAL: PilgrimRequestStatus[] = ["APPROVED", "REJECTED", "CLOSED", "CANCELLED"];

export default function Solicitudes() {
  const mine = useLoad(() => api<{ items: Mine[] }>("/auth/account/requests"), []);
  const follows = useLoad(() => api<{ items: Followed[] }>("/auth/account/follows"), []);
  const [org, setOrg] = useState("");
  const [types, setTypes] = useState<{ accepting: boolean; items: RequestType[] } | null>(null);
  const [f, setF] = useState({ typeId: "", description: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ?parroquia=<id> (desde el perfil de una parroquia) la deja elegida.
  useEffect(() => { const p = new URLSearchParams(window.location.search).get("parroquia"); if (p) setOrg(p); }, []);
  useEffect(() => {
    setTypes(null); setF((x) => ({ ...x, typeId: "" }));
    if (!org) return;
    api<{ accepting: boolean; items: RequestType[] }>(`/auth/account/requests/types?organizationId=${encodeURIComponent(org)}`).then(setTypes, () => setTypes({ accepting: false, items: [] }));
  }, [org]);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await post("/auth/account/requests", { organizationId: org, typeId: f.typeId, description: f.description.trim(), ...(f.phone.trim() ? { phone: f.phone.trim() } : {}) });
      setF({ typeId: "", description: "", phone: "" });
      setMsg({ ok: true, text: "Solicitud enviada. La parroquia la verá en su sistema y te avisaremos cuando cambie su estado." });
      await mine.reload();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "No se pudo enviar la solicitud." });
    } finally { setBusy(false); }
  }

  const chosen = types?.items.find((t) => t.id === f.typeId);
  return (
    <>
      <section className="card stack-sm">
        <h2>Nueva solicitud</h2>
        {follows.data && !follows.data.items.length && <p className="muted">Primero sigue a tu parroquia. <Link href="/parroquias">Buscar parroquias</Link></p>}
        {!!follows.data?.items.length && (
          <form className="stack-sm" onSubmit={send}>
            <label className="field"><span>Parroquia</span>
              <select value={org} onChange={(e) => setOrg(e.target.value)} required>
                <option value="">Elige una parroquia…</option>
                {follows.data.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            {org && !types && <p className="muted small">Cargando trámites…</p>}
            {types && !types.accepting && <p className="muted">Esta parroquia todavía no recibe solicitudes en línea. Comunícate con la secretaría parroquial.</p>}
            {types?.accepting && <>
              <label className="field"><span>Trámite</span>
                <select value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })} required>
                  <option value="">Elige un trámite…</option>
                  {types.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              {chosen?.description && <p className="muted small" style={{ whiteSpace: "pre-line" }}>{chosen.description}</p>}
              <label className="field"><span>¿Qué necesitas?</span>
                <textarea rows={5} minLength={10} maxLength={2000} required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
              </label>
              <p className="muted small">Escribe solo lo necesario para que la parroquia te responda. Tu nombre y tu correo se envían con la solicitud.</p>
              <label className="field"><span>Teléfono (opcional)</span>
                <input inputMode="tel" maxLength={40} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              </label>
              <div><button className="btn btn-primary" type="submit" disabled={busy || !f.typeId}>{busy ? "Enviando…" : "Enviar solicitud"}</button></div>
            </>}
          </form>
        )}
        {msg && <div className={`alert ${msg.ok ? "ok" : "err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      </section>

      <section className="card stack-sm">
        <h2>Mis solicitudes</h2>
        {!mine.data && <div className="acct-loading" style={{ color: "inherit" }}>{mine.error ?? "Cargando…"}</div>}
        {mine.data && !mine.data.items.length && <p className="muted">Todavía no hiciste solicitudes.</p>}
        {mine.data?.items.map((r) => (
          <article key={r.id} className="acct-item" data-testid={`solicitud-${r.id}`}>
            <div className="row"><b>{r.typeName}</b><span className={`pill ${FINAL.includes(r.status) ? (r.status === "APPROVED" || r.status === "CLOSED" ? "ok" : r.status === "REJECTED" ? "err" : "gray") : "warn"}`}>{PILGRIM_REQUEST_STATUS_LABEL[r.status]}</span></div>
            <div className="muted small">{r.organization.name}{r.number ? ` · N.º ${r.number}` : ""} · enviada {fmtDateTimeMedium(r.createdAt, viewerTimeZone())}</div>
            {r.message && <p style={{ whiteSpace: "pre-line", margin: "6px 0" }}><b>Mensaje de la parroquia:</b> {r.message}</p>}
            <details><summary className="small">Lo que escribiste</summary><p style={{ whiteSpace: "pre-line" }}>{r.description}</p></details>
          </article>
        ))}
      </section>
    </>
  );
}
