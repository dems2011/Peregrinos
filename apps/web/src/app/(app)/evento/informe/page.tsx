"use client";
import { useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { ApiError, api, download } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";
import { fmtDateTimeMedium } from "@/lib/format";

/** B1 — Informe del evento: solo datos reales registrados; análisis con IA opcional basado en esos mismos datos. */
interface Report {
  generatedAt: string;
  registrations: { total: number; byStatus: Record<string, number> };
  participants: { total: number; active: number; cancelled: number; capacity: number | null; spotsLeft: number | null; withAnyArrival: number; credentialsPrinted: number };
  route: {
    checkpoints: number; activeCheckpoints: number; finishers: number; completionPercent: number | null;
    durationMinutes: { measured: number; min: number | null; median: number | null; max: number | null } | null;
    points: { order: number; name: string; status: string; arrivals: number; percentOfActive: number | null; firstArrival: string | null; lastArrival: string | null }[];
  };
  arrivals: { byStatus: Record<string, number>; byMethod: Record<string, number> };
  incidents: { total: number; byType: Record<string, number>; byStatus: Record<string, number> };
  volunteers: { byStatus: Record<string, number>; activeAssignments: number };
  communication: { chatMessages: number; notifications: number };
}
const LABEL: Record<string, string> = {
  PENDING_PROOF: "Sin comprobante", IN_REVIEW: "En revisión", APPROVED: "Confirmadas", REJECTED: "Rechazadas", CANCELLED: "Canceladas",
  ACTIVE: "Vigentes", CONFLICT: "En conflicto", QR: "QR", NUMBER: "Número", SEARCH: "Búsqueda", OPEN: "Abiertas", IN_PROGRESS: "En curso", RESOLVED: "Resueltas",
  INJURED: "Lesiones", LOST: "Extraviados", WRONG_DOCUMENT: "Documento erróneo", DUPLICATE: "Duplicados", ABANDONED: "Abandonos", EMERGENCY: "Emergencias", NOTE: "Notas",
  REQUESTED: "Solicitados", UNDER_REVIEW: "En revisión", WITHDRAWN: "Se retiraron", REVOKED: "Dados de baja", COMPLETED: "Finalizados",
};
const list = (m: Record<string, number>) => (Object.keys(m).length ? Object.entries(m).map(([k, v]) => `${LABEL[k] ?? k}: ${v}`).join(" · ") : "Sin datos");

export default function Informe() {
  const { event, can } = useApp();
  const eid = event?.id;
  const r = useLoad(() => (eid ? api<Report>(`/events/${eid}/report`) : Promise.resolve(null)), [eid]);
  const [ai, setAi] = useState<{ text: string; generatedAt: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"ai" | "pdf" | null>(null);

  if (!can("report:read")) return <Page title="Informe del evento" back="/evento"><div className="alert warn">No tienes permiso para ver informes.</div></Page>;
  if (!event) return <Page title="Informe del evento" back="/evento"><div className="empty">No hay un evento seleccionado.</div></Page>;
  const tz = event.timezone;
  const d = r.data;

  async function generateAi() {
    setBusy("ai"); setErr(null);
    try { setAi(await api<{ text: string; generatedAt: string }>(`/events/${eid}/report/ai`, { method: "POST", body: "{}" })); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo generar el análisis."); } finally { setBusy(null); }
  }
  async function pdf() {
    setBusy("pdf"); setErr(null);
    try { await download(`/events/${eid}/report/pdf`, `informe-${event!.name.replace(/[^\w]+/g, "-").toLowerCase()}.pdf`, { method: "POST", body: JSON.stringify(ai ? { aiText: ai.text } : {}) }); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo generar el PDF."); } finally { setBusy(null); }
  }

  return (
    <Page title="Informe del evento" back="/evento">
      <p className="muted small" style={{ margin: 0 }}><b>{event.name}</b> · datos reales registrados{d ? ` al ${fmtDateTimeMedium(d.generatedAt, tz)}` : ""}.</p>
      <ErrorBox msg={err ?? r.error} />
      {r.loading && <Loading />}
      {d && <>
        <div className="stat-grid">
          <div className="stat"><b>{d.registrations.total}</b><span>Inscripciones</span></div>
          <div className="stat"><b>{d.participants.active}</b><span>Peregrinos vigentes{d.participants.capacity ? ` de ${d.participants.capacity}` : ""}</span></div>
          <div className="stat"><b>{d.route.finishers}</b><span>Llegaron al último punto</span></div>
          <div className="stat"><b>{d.route.completionPercent == null ? "—" : `${d.route.completionPercent} %`}</b><span>Finalización</span></div>
        </div>

        <section className="card stack-sm">
          <h2>Participación</h2>
          <div className="small">Inscripciones por estado: {list(d.registrations.byStatus)}</div>
          <div className="small">Cancelados: {d.participants.cancelled} · Con alguna llegada: {d.participants.withAnyArrival} · Credenciales impresas: {d.participants.credentialsPrinted}{d.participants.spotsLeft != null && ` · Lugares libres: ${d.participants.spotsLeft}`}</div>
        </section>

        <section className="card stack-sm">
          <h2>Recorrido</h2>
          {d.route.durationMinutes
            ? <div className="small">Duración del primer al último punto ({d.route.durationMinutes.measured} personas): mín. {d.route.durationMinutes.min} · mediana {d.route.durationMinutes.median} · máx. {d.route.durationMinutes.max} min</div>
            : <div className="small muted">Sin datos suficientes para calcular tiempos.</div>}
          {d.route.points.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Punto</th><th>Llegadas</th><th>%</th><th>Primera</th><th>Última</th></tr></thead>
                <tbody>{d.route.points.map((p) => (
                  <tr key={p.order}><td>{p.order}. {p.name}{p.status !== "ACTIVE" && " (inactivo)"}</td><td>{p.arrivals}</td><td>{p.percentOfActive ?? "—"}</td>
                    <td>{p.firstArrival ? fmtDateTimeMedium(p.firstArrival, tz, undefined, false) : "—"}</td><td>{p.lastArrival ? fmtDateTimeMedium(p.lastArrival, tz, undefined, false) : "—"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="muted small">El evento no tiene puntos de control.</p>}
        </section>

        <section className="card stack-sm">
          <h2>Llegadas, incidencias y equipo</h2>
          <div className="small">Registros de llegada: {list(d.arrivals.byStatus)} · Por método: {list(d.arrivals.byMethod)}</div>
          <div className="small">Incidencias: {d.incidents.total}{d.incidents.total ? ` · ${list(d.incidents.byType)} · ${list(d.incidents.byStatus)}` : ""}</div>
          <div className="small">Voluntarios: {list(d.volunteers.byStatus)} · Asignaciones vigentes: {d.volunteers.activeAssignments}</div>
          <div className="small">Mensajes del chat: {d.communication.chatMessages} · Avisos del evento: {d.communication.notifications}</div>
        </section>

        <section className="card stack-sm">
          <h2>Análisis con IA</h2>
          <p className="muted small" style={{ margin: 0 }}>Redacta un informe usando únicamente las estadísticas de esta pantalla. No inventa datos; revísalo antes de compartirlo.</p>
          {ai && <div className="ai-text" aria-live="polite">{ai.text}</div>}
          <div className="btn-row">
            <button className="btn" onClick={() => void generateAi()} disabled={busy !== null}><Sparkles size={18} /> {busy === "ai" ? "Generando…" : ai ? "Generar de nuevo" : "Generar informe con IA"}</button>
            <button className="btn btn-primary" onClick={() => void pdf()} disabled={busy !== null}><Download size={18} /> {busy === "pdf" ? "Preparando…" : ai ? "PDF con análisis" : "Exportar PDF"}</button>
          </div>
        </section>
      </>}
    </Page>
  );
}
