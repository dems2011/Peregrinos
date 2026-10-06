import type { Prisma } from "@prisma/client";
import { VOLUNTEER_CONSENT_CODE_HOURS, hasEventCapability } from "@peregrinos/shared";
import { AppError } from "./errors";
import { hashAccess, newAccessCode, normalizeCode } from "./pilgrim";
import { lockPersons } from "./persons";

type Tx = Prisma.TransactionClient;
const HOUR = 3_600_000;
/** Códigos que una cuenta puede generar por hora (además del límite por IP de la ruta). */
export const MAX_CONSENT_CODES_PER_HOUR = 5;

/**
 * A5.1 — Consentimiento de voluntariado entre organizaciones. Person es global; no hay directorio global de Personas.
 *  1. La persona genera un código desde su cuenta (issueVolunteerConsentCode).
 *  2. Una organización lo canjea para UN evento suyo (requestVolunteerConsent): el código se consume y queda una
 *     solicitud pendiente. La organización no recibe ningún dato de la persona.
 *  3. La persona ve qué organización y qué evento la piden y acepta (answerVolunteerRequest → VolunteerParticipation
 *     con su Person existente) o rechaza. El consentimiento queda así acotado a esa organización y ese evento:
 *     un código filtrado o entregado por error no permite sumarla en ningún otro lado sin su aceptación.
 * Distinto del código de vinculación (Person.claimCodeHash). Todo condicional (consumo/respuesta atómicos).
 */

/** Paso 1: solo cuentas PILGRIM activas con email verificado y Person. Solo vale el último código sin canjear. */
export async function issueVolunteerConsentCode(tx: Tx, userId: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { accountType: true, isActive: true, emailVerifiedAt: true, personId: true } });
  if (user.accountType !== "PILGRIM" || !user.isActive) throw new AppError(403, "ACCOUNT_INACTIVE", "Solo una cuenta de peregrino activa puede generar el código.");
  if (!user.emailVerifiedAt) throw new AppError(403, "ACCOUNT_NOT_VERIFIED", "Verifica tu correo antes de generar el código.");
  if (!user.personId) throw new AppError(409, "ACCOUNT_WITHOUT_PERSON", "La cuenta no tiene una persona asociada.");
  const now = new Date();
  const recent = await tx.volunteerConsentCode.count({ where: { userId, createdAt: { gt: new Date(now.getTime() - HOUR) } } });
  if (recent >= MAX_CONSENT_CODES_PER_HOUR) throw new AppError(429, "TOO_MANY_CODES", "Generaste demasiados códigos. Intenta más tarde.");
  await tx.volunteerConsentCode.updateMany({ where: { userId, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
  const code = newAccessCode();
  const row = await tx.volunteerConsentCode.create({
    data: { userId, codeHash: hashAccess(code), expiresAt: new Date(now.getTime() + VOLUNTEER_CONSENT_CODE_HOURS * HOUR) },
  });
  return { id: row.id, code, expiresAt: row.expiresAt };
}

const invalidCode = () => new AppError(409, "INVALID_VOLUNTEER_CODE", "El código no es válido, ya se usó o venció. Pídele uno nuevo a la persona.");

/**
 * Paso 2 (personal con volunteer:manage, evento con VOLUNTEERS — lo verifica la ruta): consume el código para este
 * evento. Código inexistente, usado, vencido o de una cuenta no habilitada → siempre la misma respuesta, y el
 * resultado nunca incluye datos de la persona (ni nombre, ni Person, ni si ya participa en algo).
 */
export async function requestVolunteerConsent(tx: Tx, input: { code: string; eventId: string; staffUserId: string }) {
  const now = new Date();
  const row = await tx.volunteerConsentCode.findUnique({
    where: { codeHash: hashAccess(normalizeCode(input.code)) },
    select: { id: true, usedAt: true, expiresAt: true, user: { select: { accountType: true, isActive: true, personId: true } } },
  });
  if (!row || row.usedAt || row.expiresAt <= now || row.user.accountType !== "PILGRIM" || !row.user.isActive || !row.user.personId) throw invalidCode();
  // Consumo condicional: dos canjes simultáneos del mismo código → uno gana, el otro recibe la respuesta genérica.
  const r = await tx.volunteerConsentCode.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now, eventId: input.eventId, requestedById: input.staffUserId, expiresAt: new Date(now.getTime() + VOLUNTEER_CONSENT_CODE_HOURS * HOUR) },
  });
  if (r.count !== 1) throw invalidCode();
  return { requestId: row.id };
}

/** Estado derivado de una solicitud (no se persiste). */
export function consentRequestStatus(r: { acceptedAt: Date | null; declinedAt: Date | null; expiresAt: Date }, now = new Date()) {
  if (r.acceptedAt) return "ACCEPTED" as const;
  if (r.declinedAt) return "DECLINED" as const;
  return r.expiresAt <= now ? ("EXPIRED" as const) : ("PENDING" as const);
}

const notPending = () => new AppError(409, "REQUEST_NOT_PENDING", "Esta solicitud ya fue respondida o venció.");

/**
 * Paso 3: la persona responde una solicitud SUYA y pendiente. Al aceptar, se vuelven a comprobar el evento (VOLUNTEERS,
 * abierto) y la organización (aprobada); se crea la VolunteerParticipation APROBADA con su Person existente (bloqueada,
 * no fusionada; nunca otra Person), sin duplicados en el evento, y la solicitud queda asociada (condicional).
 */
export async function answerVolunteerRequest(tx: Tx, userId: string, requestId: string, accept: boolean) {
  const now = new Date();
  const row = await tx.volunteerConsentCode.findFirst({
    where: { id: requestId, userId, usedAt: { not: null }, acceptedAt: null, declinedAt: null, expiresAt: { gt: now } },
    include: { event: { select: { id: true, organizationId: true, status: true, capabilities: true, organization: { select: { status: true } } } } },
  });
  if (!row || !row.event || !row.requestedById) throw notPending();
  const answer = (data: Prisma.VolunteerConsentCodeUncheckedUpdateManyInput) => tx.volunteerConsentCode.updateMany({
    where: { id: row.id, userId, acceptedAt: null, declinedAt: null, expiresAt: { gt: now } }, data,
  });
  if (!accept) {
    if ((await answer({ declinedAt: now })).count !== 1) throw notPending();
    return { requestId: row.id, eventId: row.event.id, organizationId: row.event.organizationId, volunteerId: null, personId: null };
  }
  const ev = row.event;
  if (!hasEventCapability(ev, "VOLUNTEERS") || ev.status === "FINISHED" || ev.status === "CANCELLED" || ev.organization.status !== "APPROVED") {
    throw new AppError(409, "EVENT_NOT_ACCEPTING_VOLUNTEERS", "Ese evento ya no admite voluntarios. Puedes rechazar la solicitud.");
  }
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { accountType: true, isActive: true, personId: true } });
  if (user.accountType !== "PILGRIM" || !user.isActive || !user.personId) throw new AppError(403, "ACCOUNT_INACTIVE", "Tu cuenta no está activa.");
  const personId = user.personId;
  await lockPersons(tx, [personId]);
  if (!(await tx.person.findFirst({ where: { id: personId, mergedIntoId: null }, select: { id: true } }))) throw new AppError(409, "PERSON_MERGED", "Tu identidad cambió. Vuelve a ingresar.");
  if (await tx.volunteerParticipation.findUnique({ where: { eventId_personId: { eventId: ev.id, personId } } })) {
    throw new AppError(409, "VOLUNTEER_EXISTS", "Ya eres voluntario en ese evento. Puedes rechazar esta solicitud.");
  }
  const created = await tx.volunteerParticipation.create({ data: { eventId: ev.id, personId, status: "APPROVED", createdById: row.requestedById } });
  if ((await answer({ acceptedAt: now, volunteerId: created.id })).count !== 1) throw notPending(); // revierte el alta
  return { requestId: row.id, eventId: ev.id, organizationId: ev.organizationId, volunteerId: created.id, personId };
}
