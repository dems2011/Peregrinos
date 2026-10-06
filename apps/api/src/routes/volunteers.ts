import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  VOLUNTEER_REASON_REQUIRED, VOLUNTEER_STATUS_LABEL, canTransitionVolunteer, catalogItemSchema, catalogUpdateSchema,
  createAssignmentSchema, createShiftSchema, createVolunteerSchema, revokeAssignmentSchema, updateShiftSchema,
  volunteerConsentRequestSchema, volunteerTransitionSchema,
} from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { auditTx } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { eventParam, loadEvent, loadEventWith, lockEvent } from "../lib/access";
import { personScope, resolvePersonForVolunteering } from "../lib/persons";
import { consentRequestStatus, requestVolunteerConsent } from "../lib/volunteerConsent";

type Tx = Prisma.TransactionClient;
const idParam = eventParam.extend({ id: z.string().uuid() });

/**
 * A5.1 — Voluntariado de un evento (personal de la organización con volunteer:manage).
 *  - El voluntario es una Person (sin duplicar identidad) con una VolunteerParticipation; nunca un rol de cuenta.
 *  - Escrituras: capacidad VOLUNTEERS del evento y organización habilitada (A3); lecturas siempre posibles.
 *  - Todo queda dentro del evento (FK compuestas) y de la organización (loadEvent); toda escritura sensible, auditada.
 */
export default async function volunteerRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("volunteer:manage");
  const writable = async (req: FastifyRequest, eventId: string) => {
    const event = await loadEventWith(req, eventId, "VOLUNTEERS");
    return event;
  };
  const assertOpen = (status: string) => {
    if (status === "FINISHED" || status === "CANCELLED") throw new AppError(409, "EVENT_CLOSED", "El evento ya terminó o fue cancelado.");
  };
  const audit = (tx: Tx, req: FastifyRequest, eventId: string, action: string, entityType: string, entityId: string, metadata?: Prisma.InputJsonValue) =>
    auditTx(tx, req, { action, entityType, entityId, eventId, metadata });

  /* ---------- Voluntarios ---------- */
  app.get("/volunteers", { preHandler: manage }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const items = await prisma.volunteerParticipation.findMany({
      where: { eventId },
      include: {
        person: { select: { id: true, firstName: true, lastName: true, phone: true } },
        _count: { select: { assignments: { where: { revokedAt: null } } } },
      },
      orderBy: { createdAt: "asc" },
    });
    return { items: items.map((v) => ({ id: v.id, status: v.status, notes: v.notes, decisionReason: v.decisionReason, createdAt: v.createdAt, person: v.person, activeAssignments: v._count.assignments })) };
  });

  /** Alta directa: Person visible para la organización o una nueva (coincidencias → el personal elige o confirma). */
  app.post("/volunteers", { preHandler: manage }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    const event = await writable(req, eventId);
    assertOpen(event.status);
    const body = createVolunteerSchema.parse(req.body);
    const v = await prisma.$transaction(async (tx) => {
      const personId = await resolvePersonForVolunteering(tx, personScope(req.auth), { ...body, firstName: body.firstName ?? "" });
      if (await tx.volunteerParticipation.findUnique({ where: { eventId_personId: { eventId, personId } } })) {
        throw new AppError(409, "VOLUNTEER_EXISTS", "Esta persona ya es voluntaria en este evento.");
      }
      const created = await tx.volunteerParticipation.create({ data: { eventId, personId, status: body.status, notes: body.notes, createdById: req.auth.id } });
      await audit(tx, req, eventId, "VOLUNTEER_CREATED", "VolunteerParticipation", created.id, { personId, status: created.status, via: "STAFF" });
      return created;
    });
    return reply.status(201).send(v);
  });

  /* ---------- Consentimiento de personas sin historial con esta organización (lib/volunteerConsent) ---------- */
  /**
   * Canje del código que la persona generó en su cuenta, para ESTE evento: queda una solicitud pendiente que ella acepta
   * o rechaza. La respuesta nunca incluye datos de la persona. Solo organizaciones aprobadas (contactar a alguien de
   * fuera de la organización es una acción externa). Límite por IP: el código no se prueba por fuerza bruta.
   */
  app.post("/consent-requests", { preHandler: manage, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    const event = await writable(req, eventId);
    assertOpen(event.status);
    if (req.auth.organizationStatus !== "APPROVED") {
      throw new AppError(403, "ORGANIZATION_NOT_ALLOWED", "La parroquia todavía no está aprobada: no puede sumar voluntarios de fuera de la organización.");
    }
    const { code } = volunteerConsentRequestSchema.parse(req.body);
    const r = await prisma.$transaction(async (tx) => {
      const out = await requestVolunteerConsent(tx, { code, eventId, staffUserId: req.auth.id });
      await audit(tx, req, eventId, "VOLUNTEER_CONSENT_REQUESTED", "VolunteerConsentCode", out.requestId);
      return out;
    });
    return reply.status(202).send({ requestId: r.requestId, status: "PENDING", message: "Solicitud enviada. La persona debe aceptarla desde su cuenta." });
  });
  /** Solicitudes de este evento. Datos de la persona solo cuando aceptó (a través de su voluntariado). */
  app.get("/consent-requests", { preHandler: manage }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const rows = await prisma.volunteerConsentCode.findMany({
      where: { eventId },
      select: {
        id: true, usedAt: true, expiresAt: true, acceptedAt: true, declinedAt: true,
        volunteer: { select: { id: true, person: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { usedAt: "desc" },
      take: 200,
    });
    return {
      items: rows.map((r) => ({
        id: r.id, requestedAt: r.usedAt, expiresAt: r.expiresAt, status: consentRequestStatus(r),
        volunteer: r.acceptedAt && r.volunteer ? { id: r.volunteer.id, person: r.volunteer.person } : null,
      })),
    };
  });

  /** Cambio de estado según VOLUNTEER_TRANSITIONS. Al dejar de estar aprobado, sus asignaciones vigentes se revocan. */
  app.post("/volunteers/:id/status", { preHandler: manage }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await writable(req, eventId);
    const { to, reason } = volunteerTransitionSchema.parse(req.body);
    if (VOLUNTEER_REASON_REQUIRED.includes(to) && !reason) throw new AppError(400, "REASON_REQUIRED", `Indica el motivo para «${VOLUNTEER_STATUS_LABEL[to]}».`);
    return prisma.$transaction(async (tx) => {
      await lockEvent(tx, eventId);
      const v = await tx.volunteerParticipation.findFirst({ where: { id, eventId } });
      if (!v) throw notFound("Voluntario no encontrado.");
      if (!canTransitionVolunteer(v.status, to)) {
        throw new AppError(409, "INVALID_VOLUNTEER_TRANSITION", `No se puede pasar de «${VOLUNTEER_STATUS_LABEL[v.status]}» a «${VOLUNTEER_STATUS_LABEL[to]}».`);
      }
      const now = new Date();
      const r = await tx.volunteerParticipation.updateMany({
        where: { id, status: v.status },
        data: { status: to, statusChangedById: req.auth.id, statusChangedAt: now, ...(VOLUNTEER_REASON_REQUIRED.includes(to) ? { decisionReason: reason } : {}) },
      });
      if (r.count !== 1) throw new AppError(409, "VOLUNTEER_CHANGED", "El voluntario cambió. Vuelve a cargarlo.");
      let revoked = 0;
      if (v.status === "APPROVED") {
        revoked = (await tx.volunteerAssignment.updateMany({
          where: { volunteerId: id, revokedAt: null },
          data: { revokedAt: now, revokedById: req.auth.id, revokeReason: `Voluntario: ${VOLUNTEER_STATUS_LABEL[to]}` },
        })).count;
      }
      await audit(tx, req, eventId, "VOLUNTEER_STATUS_CHANGED", "VolunteerParticipation", id, { from: v.status, to, revokedAssignments: revoked, ...(reason ? { reason } : {}) });
      return tx.volunteerParticipation.findUniqueOrThrow({ where: { id } });
    });
  });

  /* ---------- Equipos, zonas y funciones (catálogos del evento, nombres libres) ---------- */
  const catalogs = [
    { path: "teams", label: "equipo", entity: "Team", model: (tx: Tx) => tx.team },
    { path: "zones", label: "zona", entity: "Zone", model: (tx: Tx) => tx.zone },
    { path: "functions", label: "función", entity: "DutyFunction", model: (tx: Tx) => tx.dutyFunction },
  ] as const;
  for (const c of catalogs) {
    // Los tres modelos tienen la misma forma; se usan a través de una vista común.
    type Row = { id: string; eventId: string; name: string; description: string | null; isActive: boolean };
    type CatalogDelegate = {
      findMany(a: unknown): Promise<Row[]>; findFirst(a: unknown): Promise<Row | null>; create(a: unknown): Promise<Row>; update(a: unknown): Promise<Row>;
    };
    const model = (tx: Tx) => c.model(tx) as unknown as CatalogDelegate;
    const dup = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
      ? new AppError(409, "NAME_EXISTS", `Ya existe un ${c.label} con ese nombre en este evento.`) : e;

    app.get(`/${c.path}`, { preHandler: manage }, async (req) => {
      const { eventId } = eventParam.parse(req.params);
      await loadEvent(req, eventId);
      return { items: await model(prisma).findMany({ where: { eventId }, orderBy: { name: "asc" } }) };
    });
    app.post(`/${c.path}`, { preHandler: manage }, async (req, reply) => {
      const { eventId } = eventParam.parse(req.params);
      await writable(req, eventId);
      const body = catalogItemSchema.parse(req.body);
      try {
        const row = await prisma.$transaction(async (tx) => {
          const created = await model(tx).create({ data: { eventId, name: body.name, description: body.description } });
          await audit(tx, req, eventId, `${c.entity.toUpperCase()}_CREATED`, c.entity, created.id, { name: created.name });
          return created;
        });
        return reply.status(201).send(row);
      } catch (e) { throw dup(e); }
    });
    app.patch(`/${c.path}/:id`, { preHandler: manage }, async (req) => {
      const { eventId, id } = idParam.parse(req.params);
      await writable(req, eventId);
      const body = catalogUpdateSchema.parse(req.body);
      try {
        return await prisma.$transaction(async (tx) => {
          const before = await model(tx).findFirst({ where: { id, eventId } });
          if (!before) throw notFound(`No se encontró el ${c.label}.`);
          const row = await model(tx).update({ where: { id }, data: body });
          await audit(tx, req, eventId, `${c.entity.toUpperCase()}_UPDATED`, c.entity, id, { fields: Object.keys(body), ...(body.isActive === false ? { deactivated: true } : {}) });
          return row;
        });
      } catch (e) { throw dup(e); }
    });
  }

  /* ---------- Turnos ---------- */
  /** Zona y equipo deben ser del mismo evento y estar activos. */
  async function assertSameEvent(tx: Tx, eventId: string, refs: { zoneId?: string | null; teamId?: string | null; functionId?: string }) {
    if (refs.zoneId && !(await tx.zone.findFirst({ where: { id: refs.zoneId, eventId, isActive: true } }))) throw new AppError(400, "INVALID_ZONE", "La zona no existe en este evento o está desactivada.");
    if (refs.teamId && !(await tx.team.findFirst({ where: { id: refs.teamId, eventId, isActive: true } }))) throw new AppError(400, "INVALID_TEAM", "El equipo no existe en este evento o está desactivado.");
    if (refs.functionId && !(await tx.dutyFunction.findFirst({ where: { id: refs.functionId, eventId, isActive: true } }))) throw new AppError(400, "INVALID_FUNCTION", "La función no existe en este evento o está desactivada.");
  }

  app.get("/shifts", { preHandler: manage }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const items = await prisma.shift.findMany({
      where: { eventId }, orderBy: { startsAt: "asc" },
      include: { zone: { select: { id: true, name: true } }, team: { select: { id: true, name: true } }, _count: { select: { assignments: { where: { revokedAt: null } } } } },
    });
    return { items: items.map(({ _count, ...s }) => ({ ...s, activeAssignments: _count.assignments })) };
  });
  app.post("/shifts", { preHandler: manage }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    const event = await writable(req, eventId);
    assertOpen(event.status);
    const body = createShiftSchema.parse(req.body);
    const shift = await prisma.$transaction(async (tx) => {
      await assertSameEvent(tx, eventId, body);
      const created = await tx.shift.create({ data: { eventId, name: body.name, startsAt: body.startsAt, endsAt: body.endsAt, zoneId: body.zoneId ?? null, teamId: body.teamId ?? null } });
      await audit(tx, req, eventId, "SHIFT_CREATED", "Shift", created.id, { startsAt: created.startsAt.toISOString(), endsAt: created.endsAt.toISOString() });
      return created;
    });
    return reply.status(201).send(shift);
  });
  /** Editar o cancelar. Con asignaciones vigentes no se cambian horario/zona/equipo (evita conflictos); cancelar las revoca. */
  app.patch("/shifts/:id", { preHandler: manage }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await writable(req, eventId);
    const { cancel, ...body } = updateShiftSchema.parse(req.body);
    return prisma.$transaction(async (tx) => {
      await lockEvent(tx, eventId);
      const before = await tx.shift.findFirst({ where: { id, eventId } });
      if (!before) throw notFound("Turno no encontrado.");
      if (before.cancelledAt) throw new AppError(409, "SHIFT_CANCELLED", "El turno está cancelado.");
      const active = await tx.volunteerAssignment.count({ where: { shiftId: id, revokedAt: null } });
      const now = new Date();
      if (cancel) {
        const revoked = (await tx.volunteerAssignment.updateMany({ where: { shiftId: id, revokedAt: null }, data: { revokedAt: now, revokedById: req.auth.id, revokeReason: "Turno cancelado" } })).count;
        await tx.shift.update({ where: { id }, data: { cancelledAt: now } });
        await audit(tx, req, eventId, "SHIFT_CANCELLED", "Shift", id, { revokedAssignments: revoked });
        return tx.shift.findUniqueOrThrow({ where: { id } });
      }
      const changesPlan = body.startsAt !== undefined || body.endsAt !== undefined || body.zoneId !== undefined || body.teamId !== undefined;
      if (changesPlan && active > 0) throw new AppError(409, "SHIFT_HAS_ASSIGNMENTS", "El turno tiene asignaciones vigentes: revócalas antes de cambiar horario, zona o equipo.");
      const startsAt = body.startsAt ?? before.startsAt, endsAt = body.endsAt ?? before.endsAt;
      if (endsAt <= startsAt) throw new AppError(400, "INVALID_SHIFT_TIME", "El turno debe terminar después de empezar.");
      await assertSameEvent(tx, eventId, body);
      const row = await tx.shift.update({ where: { id }, data: { ...body, startsAt, endsAt } });
      await audit(tx, req, eventId, "SHIFT_UPDATED", "Shift", id, { fields: Object.keys(body) });
      return row;
    });
  });

  /* ---------- Asignaciones ---------- */
  app.get("/assignments", { preHandler: manage }, async (req) => {
    const { eventId } = eventParam.parse(req.params);
    await loadEvent(req, eventId);
    const items = await prisma.volunteerAssignment.findMany({
      where: { eventId }, orderBy: { createdAt: "desc" },
      include: {
        volunteer: { select: { id: true, status: true, person: { select: { firstName: true, lastName: true } } } },
        dutyFunction: { select: { id: true, name: true } }, team: { select: { id: true, name: true } }, zone: { select: { id: true, name: true } },
        shift: { select: { id: true, name: true, startsAt: true, endsAt: true } },
      },
    });
    return { items };
  });
  /**
   * Asignar: voluntario APROBADO + función (obligatoria) + equipo/zona/turno opcionales, todo del mismo evento y activo.
   * Con turno: hereda su zona/equipo si no se indican; no se aceptan valores distintos; sin superposición de turnos
   * para el mismo voluntario (evento bloqueado). Sin duplicados lógicos (índice único parcial).
   */
  app.post("/assignments", { preHandler: manage }, async (req, reply) => {
    const { eventId } = eventParam.parse(req.params);
    const event = await writable(req, eventId);
    assertOpen(event.status);
    const body = createAssignmentSchema.parse(req.body);
    try {
      const a = await prisma.$transaction(async (tx) => {
        await lockEvent(tx, eventId);
        const v = await tx.volunteerParticipation.findFirst({ where: { id: body.volunteerId, eventId } });
        if (!v) throw notFound("Voluntario no encontrado.");
        if (v.status !== "APPROVED") throw new AppError(409, "VOLUNTEER_NOT_APPROVED", "Solo se asigna a voluntarios aprobados.");
        let { teamId, zoneId } = body;
        if (body.shiftId) {
          const shift = await tx.shift.findFirst({ where: { id: body.shiftId, eventId } });
          if (!shift) throw new AppError(400, "INVALID_SHIFT", "El turno no existe en este evento.");
          if (shift.cancelledAt) throw new AppError(409, "SHIFT_CANCELLED", "El turno está cancelado.");
          if (shift.zoneId && zoneId && zoneId !== shift.zoneId) throw new AppError(400, "SHIFT_ZONE_MISMATCH", "La zona no coincide con la del turno.");
          if (shift.teamId && teamId && teamId !== shift.teamId) throw new AppError(400, "SHIFT_TEAM_MISMATCH", "El equipo no coincide con el del turno.");
          zoneId = zoneId ?? shift.zoneId ?? undefined;
          teamId = teamId ?? shift.teamId ?? undefined;
          const overlap = await tx.volunteerAssignment.findFirst({
            where: { volunteerId: v.id, revokedAt: null, shiftId: { not: null, notIn: [shift.id] }, shift: { cancelledAt: null, startsAt: { lt: shift.endsAt }, endsAt: { gt: shift.startsAt } } },
          });
          if (overlap) throw new AppError(409, "SHIFT_OVERLAP", "El voluntario ya tiene otro turno que se superpone con este.");
        }
        await assertSameEvent(tx, eventId, { teamId, zoneId, functionId: body.functionId });
        const created = await tx.volunteerAssignment.create({
          data: { eventId, volunteerId: v.id, functionId: body.functionId, teamId: teamId ?? null, zoneId: zoneId ?? null, shiftId: body.shiftId ?? null, createdById: req.auth.id },
        });
        await audit(tx, req, eventId, "VOLUNTEER_ASSIGNED", "VolunteerAssignment", created.id, { volunteerId: v.id, functionId: body.functionId, teamId: teamId ?? null, zoneId: zoneId ?? null, shiftId: body.shiftId ?? null });
        return created;
      });
      return reply.status(201).send(a);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(409, "ASSIGNMENT_EXISTS", "Esa asignación ya existe.");
      throw e;
    }
  });
  app.post("/assignments/:id/revoke", { preHandler: manage }, async (req) => {
    const { eventId, id } = idParam.parse(req.params);
    await writable(req, eventId);
    const { reason } = revokeAssignmentSchema.parse(req.body);
    return prisma.$transaction(async (tx) => {
      const r = await tx.volunteerAssignment.updateMany({ where: { id, eventId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: req.auth.id, revokeReason: reason } });
      if (r.count !== 1) throw new AppError(409, "ASSIGNMENT_NOT_ACTIVE", "La asignación no existe o ya fue revocada.");
      await audit(tx, req, eventId, "VOLUNTEER_ASSIGNMENT_REVOKED", "VolunteerAssignment", id, { reason });
      return tx.volunteerAssignment.findUniqueOrThrow({ where: { id } });
    });
  });
}
