// Verifica en el servidor local (dispositivo.sh) lo que se hizo desde el teléfono: decisiones de turnos guardadas,
// auditadas y publicadas en el cursor que lee SIGyP, y (si se pidió) la solicitud del fiel. Solo lectura.
import { staff } from "./lib.mjs";

const sa = await staff("superadmin@peregrinos.local");
const t = (await sa.get("/organization/turns")).body;
const recent = t.recent.map((x) => ({ title: x.title, status: x.status, reason: x.reason }));
const audit = (await sa.get("/audit-logs?pageSize=50")).body;
const rows = (audit.items ?? audit.data ?? audit).filter?.((a) => /^TURN_(ACCEPTED|REJECTED)$/.test(a.action)) ?? [];
console.log(JSON.stringify({ pendientes: t.pending.length, agenda: t.agenda.map((x) => x.title), recientes: recent, auditoria: rows.map((a) => ({ action: a.action, ip: a.ip ? "registrada" : null })) }, null, 2));
