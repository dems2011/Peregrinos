import type { Prisma } from "@prisma/client";
import { chatListQuerySchema, chatMessageSchema } from "@peregrinos/shared";
import { prisma } from "./prisma";
import { AppError, forbidden } from "./errors";

/**
 * B1 — Chat de un evento. Aislado por evento: cada consulta filtra por eventId y el acceso se decide por evento.
 * Personal: quien puede ver el evento (loadEvent: su organización; el operador, solo con punto asignado).
 * Peregrino: su Person participa (ACTIVE), está inscrita (no cancelada ni rechazada) o es voluntaria aprobada.
 */
export type ChatViewer = { kind: "STAFF"; userId: string; canModerate: boolean } | { kind: "PILGRIM"; personId: string };

const ROLE_LABEL: Record<string, string> = { SUPERADMIN: "Superadministrador", ADMIN: "Administrador", OPERATOR: "Equipo" };

/** ¿La Person pertenece a este evento como peregrina? */
export async function personInEvent(personId: string, eventId: string) {
  const [p, r, v] = await Promise.all([
    prisma.participant.findFirst({ where: { eventId, personId, status: "ACTIVE" }, select: { id: true } }),
    prisma.registration.findFirst({ where: { eventId, personId, status: { notIn: ["CANCELLED", "REJECTED"] } }, select: { id: true } }),
    prisma.volunteerParticipation.findFirst({ where: { eventId, personId, status: "APPROVED" }, select: { id: true } }),
  ]);
  return !!(p || r || v);
}

export async function assertPilgrimInEvent(personId: string | null | undefined, eventId: string) {
  if (!personId || !(await personInEvent(personId, eventId))) throw forbidden("Este chat es solo para las personas inscritas en el evento.");
}

const messageSelect = {
  id: true, body: true, createdAt: true, deletedAt: true, authorUserId: true, authorPersonId: true,
  authorUser: { select: { name: true, role: true } },
  authorPerson: { select: { firstName: true, lastName: true } },
} satisfies Prisma.EventChatMessageSelect;
type Row = Prisma.EventChatMessageGetPayload<{ select: typeof messageSelect }>;

function view(m: Row, viewer: ChatViewer) {
  const staff = !!m.authorUserId;
  // Del peregrino se muestra el nombre y la inicial del apellido; del personal, nombre y rol.
  const name = staff
    ? m.authorUser?.name ?? "Personal"
    : `${m.authorPerson?.firstName ?? "Peregrino"}${m.authorPerson?.lastName ? ` ${m.authorPerson.lastName.charAt(0)}.` : ""}`;
  return {
    id: m.id, createdAt: m.createdAt, deleted: !!m.deletedAt, body: m.deletedAt ? null : m.body,
    author: { kind: staff ? ("STAFF" as const) : ("PILGRIM" as const), name, role: staff ? ROLE_LABEL[m.authorUser?.role ?? ""] ?? null : null },
    mine: viewer.kind === "STAFF" ? m.authorUserId === viewer.userId : m.authorPersonId === viewer.personId,
  };
}

export async function listMessages(eventId: string, viewer: ChatViewer, rawQuery: unknown) {
  const q = chatListQuerySchema.parse(rawQuery ?? {});
  const rows = await prisma.eventChatMessage.findMany({
    where: { eventId, ...(q.after ? { createdAt: { gt: q.after } } : {}) },
    select: messageSelect,
    // Sin `after`: los últimos N (en orden cronológico). Con `after`: los nuevos en orden.
    orderBy: { createdAt: q.after ? "asc" : "desc" },
    take: q.limit,
  });
  const ordered = q.after ? rows : rows.reverse();
  return { items: ordered.map((m) => view(m, viewer)), serverTime: new Date() };
}

export async function postMessage(eventId: string, viewer: ChatViewer, rawBody: unknown) {
  const { body } = chatMessageSchema.parse(rawBody);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { status: true } });
  if (event.status === "CANCELLED") throw new AppError(409, "EVENT_CANCELLED", "El evento fue cancelado: el chat quedó en solo lectura.");
  const m = await prisma.eventChatMessage.create({
    data: { eventId, body, ...(viewer.kind === "STAFF" ? { authorUserId: viewer.userId } : { authorPersonId: viewer.personId }) },
    select: messageSelect,
  });
  return view(m, viewer);
}

/** Moderación: superadministrador/administrador ocultan un mensaje (queda registro de quién y cuándo). */
export async function hideMessage(eventId: string, messageId: string, viewer: ChatViewer) {
  if (viewer.kind !== "STAFF" || !viewer.canModerate) throw forbidden("Solo un administrador puede ocultar mensajes.");
  const r = await prisma.eventChatMessage.updateMany({ where: { id: messageId, eventId, deletedAt: null }, data: { deletedAt: new Date(), deletedById: viewer.userId } });
  if (r.count !== 1) throw new AppError(404, "NOT_FOUND", "Mensaje no encontrado.");
}
