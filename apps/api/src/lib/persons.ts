import type { Prisma } from "@prisma/client";
import { digitsOnly, normalizeDocument } from "@peregrinos/shared";
import { cfg } from "../config";
import { AppError, forbidden, notFound } from "./errors";
import { hashAccess, newAccessCode, normalizeCode } from "./pilgrim";

/**
 * A4a — Person: identidad humana, separada de la cuenta (User), la participación (Participant) y la inscripción
 * (Registration). Reglas:
 *  - Una organización solo ve personas propias o con participación/inscripción en sus eventos.
 *    El operador ve solo las de los eventos donde tiene un punto asignado (igual que en Participant).
 *  - La coincidencia de documento o teléfono NUNCA fusiona: se muestran candidatos y el personal confirma.
 *  - Identidad global: la Person de una cuenta (User.personId) no cambia nunca. El titular, con el código de una
 *    organización y su confirmación, une a ella el registro de esa organización (PersonClaim). Solo esa organización
 *    puede revertir la unión (unlinkAccount). Varias organizaciones pueden unir sus registros a la misma identidad.
 *  - Nunca se borra: una duplicada se marca con mergedIntoId, solo por fusión explícita del personal.
 */
type Tx = Prisma.TransactionClient;

/** Alcance de quien consulta: organización y, si es operador, sus eventos asignados. */
export interface PersonScope { organizationId: string; operatorUserId?: string }
export const personScope = (auth: { id: string; role: string; organizationId: string }): PersonScope =>
  ({ organizationId: auth.organizationId, ...(auth.role === "OPERATOR" ? { operatorUserId: auth.id } : {}) });

/** Personas que el alcance puede ver (sin exponer las de otras organizaciones ni las de eventos ajenos al operador). */
export const personVisibleWhere = (scope: PersonScope): Prisma.PersonWhereInput => {
  const event: Prisma.EventWhereInput = {
    organizationId: scope.organizationId,
    ...(scope.operatorUserId ? { assignments: { some: { userId: scope.operatorUserId } } } : {}),
  };
  return {
    mergedIntoId: null,
    OR: [
      ...(scope.operatorUserId ? [] : [{ ownerOrganizationId: scope.organizationId }]),
      { participants: { some: { event } } },
      { registrations: { some: { event } } },
      // A5.1: también quien es voluntario en sus eventos.
      { volunteerParticipations: { some: { event } } },
    ],
  };
};

export async function loadVisiblePerson(tx: Tx, scope: PersonScope, id: string) {
  const person = await tx.person.findFirst({ where: { id, ...personVisibleWhere(scope) }, include: { user: { select: { id: true } } } });
  if (!person) throw notFound("Persona no encontrada.");
  return person;
}

/** Bloquea las filas de Person hasta el fin de la transacción (fusión y vinculación no se cruzan). */
export async function lockPersons(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) await tx.$executeRaw`SELECT 1 FROM "Person" WHERE "id" = ${id} FOR UPDATE`;
}

/** Solo la organización dueña edita la identidad, y solo mientras no tenga cuenta vinculada. */
export function assertEditableBy(person: { ownerOrganizationId: string | null; user: { id: string } | null }, organizationId: string) {
  if (person.user) {
    throw new AppError(403, "PERSON_CLAIMED", "Esta persona administra sus datos desde su cuenta: el personal ya no puede editarlos.");
  }
  if (person.ownerOrganizationId !== organizationId) throw forbidden("Esta persona no pertenece a esta organización.");
}

export type PersonInput = {
  firstName: string; lastName?: string | null; documentType?: string | null; documentNumber?: string | null;
  phone?: string | null; email?: string | null; birthDate?: Date | null;
};
export const personData = (p: PersonInput) => ({
  firstName: p.firstName, lastName: p.lastName || null, documentType: p.documentType || null,
  documentNumber: p.documentNumber ? normalizeDocument(p.documentNumber) : null,
  phone: p.phone || null, phoneDigits: p.phone ? digitsOnly(p.phone) : "", email: p.email || null, birthDate: p.birthDate ?? null,
});

/**
 * Posibles duplicados dentro de lo que el alcance ya ve: mismo documento o mismo teléfono.
 * El nombre solo nunca cuenta como coincidencia (dos personas pueden llamarse igual).
 */
export async function findCandidates(tx: Tx, scope: PersonScope, p: PersonInput) {
  const doc = p.documentNumber ? normalizeDocument(p.documentNumber) : "";
  const digits = p.phone ? digitsOnly(p.phone) : "";
  const or: Prisma.PersonWhereInput[] = [];
  if (doc) or.push({ documentNumber: doc });
  if (digits.length >= 7) or.push({ phoneDigits: digits });
  if (!or.length) return [];
  return tx.person.findMany({
    where: { AND: [personVisibleWhere(scope), { OR: or }] },
    select: { id: true, firstName: true, lastName: true, documentType: true, documentNumber: true, phone: true },
    take: 10,
  });
}

/** Alta de una Person de la organización. Con coincidencias y sin confirmación explícita → 409 con candidatos. */
export async function createOrgPerson(tx: Tx, scope: PersonScope, p: PersonInput, confirmNewPerson?: boolean) {
  if (!confirmNewPerson) {
    const candidates = await findCandidates(tx, scope, p);
    if (candidates.length) {
      throw new AppError(409, "POSSIBLE_DUPLICATE", "Ya hay personas con el mismo documento o teléfono. Elige la correcta o confirma que es otra persona.", { candidates });
    }
  }
  return tx.person.create({ data: { ...personData(p), ownerOrganizationId: scope.organizationId } });
}

/** Persona para una nueva participación: la elegida (visible para el alcance) o una nueva. */
export async function resolvePersonForParticipation(
  tx: Tx, scope: PersonScope, input: PersonInput & { personId?: string; confirmNewPerson?: boolean },
) {
  if (input.personId) {
    const person = await loadVisiblePerson(tx, scope, input.personId);
    return person.id;
  }
  return (await createOrgPerson(tx, scope, input, input.confirmNewPerson)).id;
}

/**
 * A5.1 — Person para el alta directa de un voluntario por el personal: como cualquier participación (Person visible
 * para la organización o una nueva). Nunca identifica una Person global por id, nombre, documento ni correo: sumar a
 * alguien sin historial con la organización solo es posible con su consentimiento (lib/volunteerConsent).
 */
export async function resolvePersonForVolunteering(
  tx: Tx, scope: PersonScope, input: PersonInput & { personId?: string; confirmNewPerson?: boolean },
) {
  return resolvePersonForParticipation(tx, scope, input);
}

/** Eventos en los que una Person tiene participación o inscripción (para detectar conflictos antes de mover nada). */
async function historyEvents(tx: Tx, personId: string) {
  const [p, r, v] = await Promise.all([
    tx.participant.findMany({ where: { personId }, select: { id: true, eventId: true } }),
    tx.registration.findMany({ where: { personId }, select: { id: true, eventId: true } }),
    tx.volunteerParticipation.findMany({ where: { personId }, select: { id: true, eventId: true } }),
  ]);
  return { participants: p, registrations: r, volunteers: v };
}
const clashes = (a: { eventId: string }[], b: { eventId: string }[]) => a.some((x) => b.some((y) => y.eventId === x.eventId));
async function assertNoEventClash(tx: Tx, fromId: string, intoId: string) {
  const [from, into] = await Promise.all([historyEvents(tx, fromId), historyEvents(tx, intoId)]);
  if (clashes(from.participants, into.participants) || clashes(from.registrations, into.registrations) || clashes(from.volunteers, into.volunteers)) {
    throw new AppError(409, "PERSON_MERGE_CONFLICT", "Las dos personas tienen participación, inscripción o voluntariado en el mismo evento. Resuélvelo antes de unirlas.");
  }
  return from;
}

/**
 * Fusión explícita del personal (confirm: true): mueve participaciones e inscripciones de `fromId` a `intoId` y marca
 * `fromId` como fusionada (no se borra). Origen: solo un registro de ESTA organización. Destino: un registro propio o
 * la Person de una cuenta (identidad global). Nunca dos cuentas. Conflictos por evento → 409 antes de modificar nada.
 */
export async function mergePersons(tx: Tx, scope: PersonScope, fromId: string, intoId: string) {
  if (fromId === intoId) throw new AppError(400, "SAME_PERSON", "No se puede fusionar una persona consigo misma.");
  // Ambas bloqueadas en orden determinístico; todo lo que sigue se lee con las filas bloqueadas.
  await lockPersons(tx, [fromId, intoId]);
  const into = await loadVisiblePerson(tx, scope, intoId);
  const from = await loadVisiblePerson(tx, scope, fromId);
  if (from.ownerOrganizationId !== scope.organizationId) throw forbidden("Solo se pueden fusionar personas registradas por esta organización.");
  if (!into.user && into.ownerOrganizationId !== scope.organizationId) throw forbidden("La persona destino pertenece a otra organización.");
  if (from.user && into.user) {
    throw new AppError(409, "BOTH_HAVE_ACCOUNTS", "Las dos personas tienen cuenta. No se fusionan cuentas: corrige primero la vinculación.");
  }
  const moving = await assertNoEventClash(tx, fromId, intoId);

  // Si solo el origen tiene cuenta, la cuenta queda en la Person destino (condicional: no se pisa otra operación).
  let movedAccountUserId: string | null = null;
  if (from.user) {
    // Uniones vigentes (PersonClaim) apuntan a la identidad de origen: moverla las dejaría huérfanas (unlinkAccount ya no
    // las encontraría y sus registros quedarían marcados como fusionados en una Person inactiva). Primero se revierten.
    if ((await tx.personClaim.count({ where: { personId: fromId, reversedAt: null } })) > 0) {
      throw new AppError(409, "PERSON_HAS_CLAIMS", "La persona de origen tiene registros de organizaciones unidos a su cuenta. Desvincúlalos antes de fusionar.");
    }
    const r =await tx.user.updateMany({ where: { id: from.user.id, personId: fromId }, data: { personId: intoId } });
    if (r.count !== 1) throw new AppError(409, "ACCOUNT_CHANGED", "La cuenta cambió. Vuelve a cargar las personas.");
    movedAccountUserId = from.user.id;
    // El destino ahora tiene cuenta: un código de vinculación pendiente sobre él deja de servir.
    await tx.person.update({ where: { id: intoId }, data: { claimCodeHash: null, claimCodeExpiresAt: null } });
  }
  const movedParticipants = (await tx.participant.updateMany({ where: { personId: fromId }, data: { personId: intoId } })).count;
  const movedRegistrations = (await tx.registration.updateMany({ where: { personId: fromId }, data: { personId: intoId } })).count;
  const movedVolunteers = (await tx.volunteerParticipation.updateMany({ where: { personId: fromId }, data: { personId: intoId } })).count;
  const marked = await tx.person.updateMany({ where: { id: fromId, mergedIntoId: null }, data: { mergedIntoId: intoId, claimCodeHash: null, claimCodeExpiresAt: null } });
  if (marked.count !== 1) throw new AppError(409, "PERSON_CHANGED", "La persona cambió. Vuelve a cargarla.");
  // A5.0: un registro de la organización unido a la identidad global de una cuenta queda registrado igual que un canje
  // (exactamente qué se movió): esa misma organización puede revertirlo con unlinkAccount; ninguna otra.
  let claimId: string | null = null;
  if (into.user && !from.user) {
    claimId = (await tx.personClaim.create({
      data: {
        personId: intoId, sourcePersonId: fromId, organizationId: scope.organizationId, userId: into.user.id,
        movedParticipantIds: moving.participants.map((p) => p.id), movedRegistrationIds: moving.registrations.map((r) => r.id),
        movedVolunteerIds: moving.volunteers.map((v) => v.id),
      },
    })).id;
  }
  return { movedParticipants, movedRegistrations, movedVolunteers, movedAccountUserId, claimId };
}

/** Código de vinculación (un solo uso, vence). Se muestra una vez; en la BD solo queda su hash. */
export function newClaimCode() {
  const code = newAccessCode();
  return { code, hash: hashAccess(code), expiresAt: new Date(Date.now() + cfg.INVITE_TTL_DAYS * 86_400_000) };
}

/**
 * A5.0 — Canje del código: une el registro de una organización a la IDENTIDAD GLOBAL de la cuenta.
 *  - La Person de la cuenta (User.personId) es la identidad global y NUNCA cambia: una cuenta, una Person.
 *  - Explícito y autorizado: el código lo emitió la organización (prueba de posesión) y el titular confirma.
 *  - Solo mueve los datos de ESA organización (participaciones e inscripciones de su registro); los de otras
 *    organizaciones no se tocan. Conflicto por evento → 409 antes de modificar nada.
 *  - El registro de la organización queda marcado (no se borra) y PersonClaim guarda exactamente qué se movió:
 *    solo esa organización puede revertirlo (unlinkAccount).
 *  - Únicamente cuentas PILGRIM activas con email verificado. Atómico, bloqueado y condicional.
 */
export async function claimPersonForUser(tx: Tx, userId: string, rawCode: string) {
  const hash = hashAccess(normalizeCode(rawCode));
  const invalid = () => new AppError(409, "INVALID_CLAIM_CODE", "El código de vinculación no es válido o ya venció.");
  const found = await tx.person.findUnique({ where: { claimCodeHash: hash }, select: { id: true } });
  if (!found) throw invalid();
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, personId: true, accountType: true, isActive: true, emailVerifiedAt: true } });
  if (user.accountType !== "PILGRIM" || !user.isActive) {
    throw new AppError(403, "ACCOUNT_INACTIVE", "Solo una cuenta de peregrino activa puede vincular su persona.");
  }
  if (!user.emailVerifiedAt) {
    throw new AppError(403, "ACCOUNT_NOT_VERIFIED", "Verifica tu correo antes de vincular tu persona.");
  }
  if (!user.personId) throw new AppError(409, "ACCOUNT_WITHOUT_PERSON", "La cuenta no tiene una persona asociada.");
  const globalId = user.personId;
  await lockPersons(tx, [found.id, globalId]);
  const source = await tx.person.findUnique({ where: { id: found.id }, include: { user: { select: { id: true } } } });
  if (!source) throw invalid();
  // Quien tiene el código (prueba de posesión) puede saber por qué no sirve; sin código válido solo hay "inválido".
  if (source.mergedIntoId) throw new AppError(409, "PERSON_MERGED", "Esta persona fue unificada con otra. Pide un código nuevo a la organización.");
  if (source.user || source.id === globalId) throw new AppError(409, "PERSON_ALREADY_LINKED", "Esta persona ya está vinculada a una cuenta.");
  if (!source.claimCodeExpiresAt || source.claimCodeExpiresAt <= new Date()) {
    throw new AppError(409, "CLAIM_CODE_EXPIRED", "El código venció. Pide uno nuevo a la organización.");
  }
  if (!source.ownerOrganizationId) throw invalid(); // los códigos solo se emiten para registros de una organización
  const moved = await assertNoEventClash(tx, source.id, globalId);
  // Consume el código (un solo uso) de forma condicional: dos canjes simultáneos no se pisan.
  const used = await tx.person.updateMany({
    where: { id: source.id, claimCodeHash: hash, claimCodeExpiresAt: { gt: new Date() }, mergedIntoId: null },
    data: { claimCodeHash: null, claimCodeExpiresAt: null, mergedIntoId: globalId },
  });
  if (used.count !== 1) throw invalid();
  const participantIds = moved.participants.map((p) => p.id);
  const registrationIds = moved.registrations.map((r) => r.id);
  const volunteerIds = moved.volunteers.map((v) => v.id);
  if (participantIds.length) await tx.participant.updateMany({ where: { id: { in: participantIds }, personId: source.id }, data: { personId: globalId } });
  if (registrationIds.length) await tx.registration.updateMany({ where: { id: { in: registrationIds }, personId: source.id }, data: { personId: globalId } });
  if (volunteerIds.length) await tx.volunteerParticipation.updateMany({ where: { id: { in: volunteerIds }, personId: source.id }, data: { personId: globalId } });
  const claim = await tx.personClaim.create({
    data: { personId: globalId, sourcePersonId: source.id, organizationId: source.ownerOrganizationId, userId, movedParticipantIds: participantIds, movedRegistrationIds: registrationIds, movedVolunteerIds: volunteerIds },
  });
  return { claimId: claim.id, personId: globalId, sourcePersonId: source.id, ownerOrganizationId: source.ownerOrganizationId, movedParticipants: participantIds.length, movedRegistrations: registrationIds.length, movedVolunteers: volunteerIds.length };
}

/**
 * A5.0 — Desvincular (corregir un código entregado a la persona equivocada). Solo el personal de la organización que
 * emitió el código: revierte SUS uniones vigentes con esa identidad global. Devuelve a su registro exactamente las
 * participaciones e inscripciones que se movieron (las que siguen en la identidad global) y lo reactiva.
 * Nunca toca datos de otras organizaciones ni la identidad de la cuenta (User.personId no cambia).
 */
export async function unlinkAccount(tx: Tx, scope: PersonScope, personId: string, actorUserId: string) {
  const claims = await tx.personClaim.findMany({ where: { personId, organizationId: scope.organizationId, reversedAt: null } });
  await lockPersons(tx, [personId, ...claims.map((c) => c.sourcePersonId)]);
  const person = await loadVisiblePerson(tx, scope, personId);
  if (!person.user) throw new AppError(409, "PERSON_NOT_LINKED", "Esta persona no tiene una cuenta vinculada.");
  const account = await tx.user.findUniqueOrThrow({ where: { id: person.user.id }, select: { id: true, accountType: true, isActive: true } });
  if (account.accountType !== "PILGRIM" || !account.isActive) {
    throw new AppError(409, "ACCOUNT_NOT_UNLINKABLE", "Solo se puede desvincular una cuenta de peregrino activa.");
  }
  const active = await tx.personClaim.findMany({ where: { personId, organizationId: scope.organizationId, reversedAt: null } });
  if (!active.length) throw new AppError(409, "PERSON_NOT_LINKED", "Esta organización no tiene registros unidos a esta cuenta.");
  let restoredParticipants = 0, restoredRegistrations = 0, restoredVolunteers = 0;
  for (const c of active) {
    const source = await tx.person.findUniqueOrThrow({ where: { id: c.sourcePersonId } });
    if (source.ownerOrganizationId !== scope.organizationId || source.mergedIntoId !== personId) {
      throw new AppError(409, "PERSON_CHANGED", "La unión cambió. Vuelve a cargar la persona.");
    }
    restoredParticipants += (await tx.participant.updateMany({ where: { id: { in: c.movedParticipantIds }, personId }, data: { personId: source.id } })).count;
    restoredRegistrations += (await tx.registration.updateMany({ where: { id: { in: c.movedRegistrationIds }, personId }, data: { personId: source.id } })).count;
    restoredVolunteers += (await tx.volunteerParticipation.updateMany({ where: { id: { in: c.movedVolunteerIds }, personId }, data: { personId: source.id } })).count;
    await tx.person.update({ where: { id: source.id }, data: { mergedIntoId: null } });
    const r = await tx.personClaim.updateMany({ where: { id: c.id, reversedAt: null }, data: { reversedAt: new Date(), reversedById: actorUserId } });
    if (r.count !== 1) throw new AppError(409, "PERSON_CHANGED", "La unión cambió. Vuelve a cargar la persona.");
  }
  return { userId: account.id, reversedClaims: active.map((c) => c.id), restoredPersonIds: active.map((c) => c.sourcePersonId), restoredParticipants, restoredRegistrations, restoredVolunteers };
}

/** Vista para el personal. El operador ve lo mínimo (como en Participant). */
export function personView(
  p: { id: string; firstName: string; lastName: string | null; documentType: string | null; documentNumber: string | null; phone: string | null; email: string | null; birthDate: Date | null; ownerOrganizationId: string | null; createdAt: Date; user?: { id: string } | null },
  role: string,
) {
  const base = { id: p.id, firstName: p.firstName, lastName: p.lastName, documentNumber: p.documentNumber, phone: p.phone, claimed: !!p.user };
  if (role === "OPERATOR") return base;
  return { ...base, documentType: p.documentType, email: p.email, birthDate: p.birthDate, createdAt: p.createdAt };
}
