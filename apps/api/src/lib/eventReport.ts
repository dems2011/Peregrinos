import { prisma } from "./prisma";

/**
 * B1 — Informe del evento: SOLO datos reales registrados en la base (nada estimado ni inventado). Lo usan la pantalla,
 * el PDF y el análisis con IA (que recibe exactamente este objeto).
 */
export async function buildEventReport(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: {
      id: true, name: true, type: true, status: true, startsAt: true, endsAt: true, timezone: true, capacity: true,
      visibility: true, parishName: true, organization: { select: { name: true } },
    },
  });

  const [regGroups, partGroups, checkpoints, checkinGroups, methodGroups, incidentTypes, incidentStatus, volunteerGroups,
    activeAssignments, chatMessages, notifications, credentialsPrinted, activeCheckins] = await Promise.all([
    prisma.registration.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } }),
    prisma.participant.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } }),
    prisma.checkpoint.findMany({ where: { eventId }, orderBy: { order: "asc" }, select: { id: true, order: true, name: true, status: true, capacity: true } }),
    prisma.checkin.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } }),
    prisma.checkin.groupBy({ by: ["method"], where: { eventId, status: "ACTIVE" }, _count: { _all: true } }),
    prisma.incident.groupBy({ by: ["type"], where: { eventId }, _count: { _all: true } }),
    prisma.incident.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } }),
    prisma.volunteerParticipation.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } }),
    prisma.volunteerAssignment.count({ where: { eventId, revokedAt: null } }),
    prisma.eventChatMessage.count({ where: { eventId, deletedAt: null } }),
    prisma.notification.count({ where: { eventId } }),
    prisma.participant.count({ where: { eventId, credentialPrintedAt: { not: null } } }),
    prisma.checkin.findMany({ where: { eventId, status: "ACTIVE" }, select: { participantId: true, checkpointId: true, timestamp: true } }),
  ]);

  const count = <T extends string>(rows: { _count: { _all: number } }[], key: (r: never) => T) =>
    Object.fromEntries(rows.map((r) => [key(r as never), r._count._all])) as Record<string, number>;
  const registrations = count(regGroups, (r: { status: string }) => r.status);
  const participants = count(partGroups, (r: { status: string }) => r.status);
  const activeParticipants = participants.ACTIVE ?? 0;

  // Llegadas por punto (solo registros vigentes) y primeras/últimas horas reales.
  const byCheckpoint = new Map<string, Date[]>();
  const byParticipant = new Map<string, Map<string, Date>>();
  for (const c of activeCheckins) {
    (byCheckpoint.get(c.checkpointId) ?? byCheckpoint.set(c.checkpointId, []).get(c.checkpointId)!).push(c.timestamp);
    (byParticipant.get(c.participantId) ?? byParticipant.set(c.participantId, new Map()).get(c.participantId)!).set(c.checkpointId, c.timestamp);
  }
  const points = checkpoints.map((cp) => {
    const times = (byCheckpoint.get(cp.id) ?? []).sort((a, b) => +a - +b);
    return {
      order: cp.order, name: cp.name, status: cp.status, capacity: cp.capacity, arrivals: times.length,
      percentOfActive: activeParticipants ? Math.round((times.length / activeParticipants) * 1000) / 10 : null,
      firstArrival: times[0] ?? null, lastArrival: times[times.length - 1] ?? null,
    };
  });

  // Finalización: llegaron al último punto activo del recorrido. Duración: primer registro → llegada al último punto.
  const activePoints = checkpoints.filter((c) => c.status === "ACTIVE");
  const first = activePoints[0], last = activePoints[activePoints.length - 1];
  const durations: number[] = [];
  let finishers = 0;
  if (last) {
    for (const m of byParticipant.values()) {
      const end = m.get(last.id);
      if (!end) continue;
      finishers++;
      const start = first && first.id !== last.id ? m.get(first.id) : undefined;
      if (start && end > start) durations.push((+end - +start) / 60000);
    }
  }
  durations.sort((a, b) => a - b);
  const median = durations.length ? (durations.length % 2 ? durations[(durations.length - 1) / 2] : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2) : null;
  const round = (n: number | null) => (n == null ? null : Math.round(n));

  return {
    generatedAt: new Date(),
    event: { ...event, parish: event.parishName ?? event.organization.name },
    registrations: { total: Object.values(registrations).reduce((a, b) => a + b, 0), byStatus: registrations },
    participants: {
      total: Object.values(participants).reduce((a, b) => a + b, 0), active: activeParticipants, cancelled: participants.CANCELLED ?? 0,
      capacity: event.capacity, spotsLeft: event.capacity != null ? Math.max(0, event.capacity - activeParticipants) : null,
      withAnyArrival: byParticipant.size, credentialsPrinted,
    },
    route: {
      checkpoints: points.length, activeCheckpoints: activePoints.length, finishers,
      completionPercent: activeParticipants && last ? Math.round((finishers / activeParticipants) * 1000) / 10 : null,
      durationMinutes: durations.length ? { measured: durations.length, min: round(durations[0]), median: round(median), max: round(durations[durations.length - 1]) } : null,
      points,
    },
    arrivals: { byStatus: count(checkinGroups, (r: { status: string }) => r.status), byMethod: count(methodGroups, (r: { method: string }) => r.method) },
    incidents: {
      total: incidentTypes.reduce((a, r) => a + r._count._all, 0),
      byType: count(incidentTypes, (r: { type: string }) => r.type), byStatus: count(incidentStatus, (r: { status: string }) => r.status),
    },
    volunteers: { byStatus: count(volunteerGroups, (r: { status: string }) => r.status), activeAssignments },
    communication: { chatMessages, notifications },
  };
}

export type EventReport = Awaited<ReturnType<typeof buildEventReport>>;
