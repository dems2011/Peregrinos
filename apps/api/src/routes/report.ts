import type { FastifyInstance } from "fastify";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import PDFDocument from "pdfkit";
import { formatDateTime } from "@peregrinos/shared";
import { cfg } from "../config";
import { eventParam, loadEvent } from "../lib/access";
import { audit } from "../lib/audit";
import { AppError } from "../lib/errors";
import { buildEventReport, type EventReport } from "../lib/eventReport";

/**
 * B1 — Informe del evento (prefijo /api/events/:eventId/report). Permiso report:read y acceso al evento.
 *  GET  /       → estadísticas reales.
 *  POST /ai     → análisis redactado por IA usando EXCLUSIVAMENTE esas estadísticas (requiere ANTHROPIC_API_KEY).
 *  POST /pdf    → PDF con las estadísticas y, si se envía, el análisis ya generado.
 */
const SYSTEM_PROMPT = `Eres un analista que redacta el informe de cierre de un evento parroquial (peregrinación, procesión, retiro u otro).
Recibes un JSON con las estadísticas REALES del evento. Escribe en español un informe claro para el párroco y su equipo.
Reglas estrictas:
- Usa EXCLUSIVAMENTE los datos del JSON. No inventes cifras, nombres, causas, horarios ni comparaciones con otros eventos.
- Si un dato falta, es null o es 0, dilo con naturalidad ("no se registraron incidencias", "no hay datos de tiempos") sin suponer por qué.
- Cada número que menciones debe figurar en el JSON o ser un cálculo directo y evidente a partir de él.
- Estructura: 1) Resumen (3–4 oraciones). 2) Participación e inscripciones. 3) Recorrido y llegadas por punto. 4) Incidencias y voluntariado. 5) Observaciones y recomendaciones prácticas, basadas solo en lo que muestran los datos.
- Texto plano con títulos breves; sin tablas ni markdown complejo. Máximo 600 palabras.`;

const aiBody = z.object({}).strict().optional();
const pdfBody = z.object({ aiText: z.string().max(12000).optional() }).strict().optional();

const STATUS_ES: Record<string, string> = {
  PENDING_PROOF: "Falta comprobante", IN_REVIEW: "En revisión", APPROVED: "Confirmadas", REJECTED: "Rechazadas", CANCELLED: "Canceladas",
  ACTIVE: "Vigentes", CONFLICT: "En conflicto", OPEN: "Abiertas", IN_PROGRESS: "En curso", RESOLVED: "Resueltas",
  REQUESTED: "Solicitados", UNDER_REVIEW: "En revisión", WITHDRAWN: "Se retiraron", REVOKED: "Dados de baja", COMPLETED: "Finalizados",
  QR: "QR", NUMBER: "Número", SEARCH: "Búsqueda", INJURED: "Lesiones", LOST: "Extraviados", WRONG_DOCUMENT: "Documento erróneo",
  DUPLICATE: "Duplicados", ABANDONED: "Abandonos", EMERGENCY: "Emergencias", NOTE: "Notas",
};

export default async function reportRoutes(app: FastifyInstance) {
  const perm = app.requirePermission("report:read");

  app.get("/", { preHandler: perm }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    return buildEventReport(eventId);
  });

  app.post("/ai", { preHandler: perm, config: { rateLimit: { max: 6, timeWindow: "1 hour" } } }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    aiBody.parse(req.body ?? undefined);
    await loadEvent(req, eventId);
    if (!cfg.ANTHROPIC_API_KEY) {
      throw new AppError(503, "AI_NOT_CONFIGURED", "El informe con IA no está configurado en el servidor (falta ANTHROPIC_API_KEY).");
    }
    const report = await buildEventReport(eventId);
    const client = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });
    let response;
    try {
      response = await client.beta.messages.create({
        model: cfg.ANTHROPIC_MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        output_config: { effort: "medium" },
        // Si el modelo declina por política, el servidor reintenta con un modelo de respaldo (dentro de la misma llamada).
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [{ role: "user", content: `Estadísticas del evento (JSON):\n${JSON.stringify(report)}` }],
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new AppError(429, "AI_RATE_LIMITED", "El servicio de IA está ocupado. Intenta en unos minutos.");
      if (e instanceof Anthropic.APIError) {
        req.log.error({ status: e.status }, "Error del servicio de IA");
        throw new AppError(502, "AI_UNAVAILABLE", "No se pudo generar el informe con IA. Intenta nuevamente.");
      }
      throw e;
    }
    if (response.stop_reason === "refusal") throw new AppError(422, "AI_REFUSED", "El servicio de IA no pudo generar este informe.");
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    if (!text) throw new AppError(502, "AI_EMPTY", "El servicio de IA no devolvió texto. Intenta nuevamente.");
    await audit(req, { action: "EVENT_REPORT_AI_GENERATED", entityType: "Event", entityId: eventId, eventId, metadata: { model: response.model, outputTokens: response.usage.output_tokens } });
    return { text, model: response.model, generatedAt: new Date(), basedOn: report.generatedAt };
  });

  app.post("/pdf", { preHandler: perm, config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    const body = pdfBody.parse(req.body ?? undefined);
    await loadEvent(req, eventId);
    const report = await buildEventReport(eventId);
    const pdf = await reportPdf(report, body?.aiText);
    await audit(req, { action: "EVENT_REPORT_EXPORTED", entityType: "Event", entityId: eventId, eventId, metadata: { withAi: !!body?.aiText } });
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="informe-${report.event.name.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).toLowerCase() || "evento"}.pdf"`);
    reply.header("Cache-Control", "private, no-store");
    return reply.send(pdf);
  });
}

/** PDF del informe: datos reales en tablas simples y, si existe, el análisis de IA identificado como tal. */
function reportPdf(r: EventReport, aiText?: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Informe · ${r.event.name}`, Author: r.event.parish } });
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const tz = r.event.timezone;
  const dt = (d: Date | string | null) => (d ? formatDateTime(d, { timeZone: tz, monthName: true }) : "—");
  const h = (t: string) => { doc.moveDown(0.8); doc.fillColor("#0B3158").font("Helvetica-Bold").fontSize(13).text(t); doc.moveDown(0.3); doc.fillColor("#17324D").font("Helvetica").fontSize(10); };
  const kv = (k: string, v: string | number | null) => doc.font("Helvetica-Bold").text(`${k}: `, { continued: true }).font("Helvetica").text(v == null ? "—" : String(v));
  const map = (m: Record<string, number>) => (Object.keys(m).length ? Object.entries(m).map(([k, v]) => `${STATUS_ES[k] ?? k}: ${v}`).join(" · ") : "sin datos");

  doc.fillColor("#0B3158").font("Helvetica-Bold").fontSize(20).text(`Informe del evento`);
  doc.fontSize(14).text(r.event.name);
  doc.fillColor("#6D7D8E").font("Helvetica").fontSize(10).text(`${r.event.parish} · ${dt(r.event.startsAt)}${r.event.endsAt ? ` – ${dt(r.event.endsAt)}` : ""} · generado ${dt(r.generatedAt)}`);

  h("Participación");
  kv("Inscripciones", r.registrations.total); kv("Por estado", map(r.registrations.byStatus));
  kv("Participantes vigentes", r.participants.active); kv("Cancelados", r.participants.cancelled);
  kv("Cupo máximo", r.participants.capacity ?? "sin límite"); kv("Lugares libres", r.participants.spotsLeft);
  kv("Con al menos una llegada", r.participants.withAnyArrival); kv("Credenciales impresas", r.participants.credentialsPrinted);

  h("Recorrido");
  kv("Puntos de control", `${r.route.checkpoints} (${r.route.activeCheckpoints} activos)`);
  kv("Llegaron al último punto", r.route.finishers);
  kv("Finalización", r.route.completionPercent == null ? "—" : `${r.route.completionPercent} %`);
  if (r.route.durationMinutes) kv("Duración (primer → último punto)", `mín. ${r.route.durationMinutes.min} · mediana ${r.route.durationMinutes.median} · máx. ${r.route.durationMinutes.max} min (${r.route.durationMinutes.measured} personas)`);
  doc.moveDown(0.3);
  for (const p of r.route.points) {
    doc.font("Helvetica-Bold").text(`${p.order}. ${p.name}`, { continued: true })
      .font("Helvetica").text(`  —  ${p.arrivals} llegadas${p.percentOfActive != null ? ` (${p.percentOfActive} %)` : ""} · primera ${dt(p.firstArrival)} · última ${dt(p.lastArrival)}`);
  }

  h("Llegadas e incidencias");
  kv("Registros de llegada", map(r.arrivals.byStatus)); kv("Por método", map(r.arrivals.byMethod));
  kv("Incidencias", r.incidents.total); kv("Por tipo", map(r.incidents.byType)); kv("Por estado", map(r.incidents.byStatus));

  h("Voluntariado y comunicación");
  kv("Voluntarios", map(r.volunteers.byStatus)); kv("Asignaciones vigentes", r.volunteers.activeAssignments);
  kv("Mensajes del chat", r.communication.chatMessages); kv("Avisos enviados", r.communication.notifications);

  if (aiText) {
    doc.addPage();
    doc.fillColor("#0B3158").font("Helvetica-Bold").fontSize(15).text("Análisis (generado con IA)");
    doc.fillColor("#6D7D8E").font("Helvetica").fontSize(9).text("Redactado a partir de las estadísticas de este informe. Revísalo antes de compartirlo.");
    doc.moveDown(0.6);
    doc.fillColor("#17324D").fontSize(10.5).text(aiText, { align: "left" });
  }
  doc.end();
  return done;
}
