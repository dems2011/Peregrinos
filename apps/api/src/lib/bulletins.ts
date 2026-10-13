import type { Bulletin } from "@prisma/client";
import { DONATION_PURPOSE_LABEL, SCHEDULE_KIND_LABEL, WEEKDAY_LABEL, formatDateTime } from "@peregrinos/shared";
import { prisma } from "./prisma";

/**
 * B5 — Boletín: texto propio + secciones que se arman con lo que la parroquia ya publica (agenda, eventos públicos
 * próximos, campañas activas). No se copia nada: se lee en el momento, así el boletín no queda desactualizado respecto
 * de la fuente (salvo el correo, que es una foto del momento de enviarlo).
 */
export async function bulletinSections(organizationId: string, b: Pick<Bulletin, "includeSchedule" | "includeEvents" | "includeCampaigns">) {
  const [schedule, events, campaigns] = await Promise.all([
    b.includeSchedule ? prisma.scheduleItem.findMany({ where: { organizationId, active: true, weekday: { not: null } }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] }) : [],
    b.includeEvents ? prisma.event.findMany({ where: { organizationId, visibility: "PUBLIC", status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, orderBy: { startsAt: "asc" }, take: 5, select: { id: true, name: true, startsAt: true, timezone: true, locationName: true } }) : [],
    b.includeCampaigns ? prisma.donationCampaign.findMany({ where: { organizationId, active: true }, orderBy: [{ sortOrder: "asc" }], select: { id: true, title: true, purpose: true } }) : [],
  ]);
  return {
    schedule: schedule.map((s) => ({ weekday: WEEKDAY_LABEL[s.weekday!], kind: SCHEDULE_KIND_LABEL[s.kind], title: s.title, startTime: s.startTime, location: s.location })),
    events: events.map((e) => ({ id: e.id, name: e.name, when: formatDateTime(e.startsAt, { timeZone: e.timezone }), locationName: e.locationName })),
    campaigns: campaigns.map((c) => ({ id: c.id, title: c.title, purpose: DONATION_PURPOSE_LABEL[c.purpose] })),
  };
}

/** Texto plano completo (correo y vista previa). */
export function bulletinText(body: string, s: Awaited<ReturnType<typeof bulletinSections>>) {
  const parts = [body.trim()];
  if (s.schedule.length) parts.push("HORARIOS\n" + s.schedule.map((x) => `• ${x.weekday} ${x.startTime} — ${x.title}${x.location ? ` (${x.location})` : ""}`).join("\n"));
  if (s.events.length) parts.push("PRÓXIMOS EVENTOS\n" + s.events.map((e) => `• ${e.name} — ${e.when}${e.locationName ? `, ${e.locationName}` : ""}`).join("\n"));
  if (s.campaigns.length) parts.push("COLABORA CON LA PARROQUIA\n" + s.campaigns.map((c) => `• ${c.title} (${c.purpose})`).join("\n"));
  return parts.join("\n\n");
}
