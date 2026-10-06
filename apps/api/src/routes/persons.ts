import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { createPersonSchema, digitsOnly, mergePersonSchema, normalizeDocument, personListSchema, unlinkAccountSchema, updatePersonSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { AppError } from "../lib/errors";
import { formatCode } from "../lib/pilgrim";
import {
  assertEditableBy, createOrgPerson, loadVisiblePerson, lockPersons, mergePersons, newClaimCode, personData, personScope, personView,
  personVisibleWhere, unlinkAccount,
} from "../lib/persons";

const idParam = z.object({ id: z.string().uuid() });

/**
 * A4a — Personas (identidad humana) para el personal. Permisos existentes, sin permisos nuevos:
 * lectura participant:read · alta participant:create · edición, fusión y código de vinculación participant:manage.
 * Todo queda limitado al alcance (personVisibleWhere): nunca personas de otra organización; el operador, solo las
 * de los eventos donde tiene un punto asignado.
 */
export default async function personRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requirePermission("participant:read") }, async (req) => {
    const q = personListSchema.parse(req.query);
    const text = q.q ?? "";
    const or: Prisma.PersonWhereInput[] = [];
    if (text) {
      or.push({ firstName: { contains: text, mode: "insensitive" } }, { lastName: { contains: text, mode: "insensitive" } });
      const doc = normalizeDocument(text), digits = digitsOnly(text);
      if (doc.length >= 3) or.push({ documentNumber: { contains: doc } });
      if (digits.length >= 4) or.push({ phoneDigits: { contains: digits } });
    }
    const where: Prisma.PersonWhereInput = { AND: [personVisibleWhere(personScope(req.auth)), ...(or.length ? [{ OR: or }] : [])] };
    const pageSize = req.auth.role === "OPERATOR" ? Math.min(q.pageSize, 10) : q.pageSize;
    const [total, items] = await prisma.$transaction([
      prisma.person.count({ where }),
      prisma.person.findMany({ where, include: { user: { select: { id: true } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (q.page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page: q.page, pageSize, items: items.map((p) => personView(p, req.auth.role)) };
  });

  /** Ficha con su historial, solo en eventos de esta organización (y, para el operador, solo los asignados). */
  app.get("/:id", { preHandler: app.requirePermission("participant:read") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const scope = personScope(req.auth);
    const person = await loadVisiblePerson(prisma, scope, id);
    const event: Prisma.EventWhereInput = {
      organizationId: scope.organizationId,
      ...(scope.operatorUserId ? { assignments: { some: { userId: scope.operatorUserId } } } : {}),
    };
    const [participations, registrations, volunteering] = await Promise.all([
      prisma.participant.findMany({
        where: { personId: id, event },
        select: { id: true, number: true, status: true, eventId: true, event: { select: { name: true, startsAt: true, status: true } }, _count: { select: { checkins: { where: { status: "ACTIVE" } } } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.registration.findMany({
        where: { personId: id, event },
        select: { id: true, status: true, eventId: true, event: { select: { name: true } }, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      // A5.1: el voluntariado también hace visible a la persona; la ficha lo muestra con el mismo alcance.
      prisma.volunteerParticipation.findMany({
        where: { personId: id, event },
        select: { id: true, status: true, eventId: true, event: { select: { name: true } }, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { person: personView(person, req.auth.role), editable: person.ownerOrganizationId === scope.organizationId && !person.user, participations, registrations, volunteering };
  });

  /** Alta manual (persona sin cuenta ni tecnología: nada de contacto es obligatorio). */
  app.post("/", { preHandler: app.requirePermission("participant:create") }, async (req, reply) => {
    const { confirmNewPerson, ...body } = createPersonSchema.parse(req.body);
    const person = await prisma.$transaction((tx) => createOrgPerson(tx, personScope(req.auth), body, confirmNewPerson));
    await audit(req, { action: "PERSON_CREATED", entityType: "Person", entityId: person.id, organizationId: req.auth.organizationId, metadata: { confirmedDespiteCandidates: !!confirmNewPerson } });
    return reply.status(201).send(personView({ ...person, user: null }, req.auth.role));
  });

  app.patch("/:id", { preHandler: app.requirePermission("participant:manage") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = updatePersonSchema.parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      await lockPersons(tx, [id]);
      const person = await loadVisiblePerson(tx, personScope(req.auth), id);
      assertEditableBy(person, req.auth.organizationId);
      const full = personData({ ...person, ...body, firstName: body.firstName ?? person.firstName });
      const data = Object.fromEntries(Object.entries(full).filter(([k]) => k in body || (k === "phoneDigits" && "phone" in body)));
      // Condicional: si entre tanto la reclamó su titular, no se pisa su identidad.
      const r = await tx.person.updateMany({ where: { id, ownerOrganizationId: req.auth.organizationId, mergedIntoId: null, user: { is: null } }, data });
      if (r.count !== 1) throw new AppError(409, "PERSON_CHANGED", "La persona cambió. Vuelve a cargarla.");
      return tx.person.findUniqueOrThrow({ where: { id }, include: { user: { select: { id: true } } } });
    });
    await audit(req, { action: "PERSON_UPDATED", entityType: "Person", entityId: id, organizationId: req.auth.organizationId, metadata: { fields: Object.keys(body) } });
    return personView(updated, req.auth.role);
  });

  /**
   * Código de vinculación: el personal lo entrega a la persona (en mano) y ella lo canjea desde su cuenta.
   * Así se vincula una cuenta existente sin que la coincidencia de documento o correo sirva como prueba.
   * Emitir uno nuevo invalida el anterior (un solo hash por persona).
   */
  app.post("/:id/claim-code", { preHandler: app.requirePermission("participant:manage") }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const claim = newClaimCode();
    await prisma.$transaction(async (tx) => {
      await lockPersons(tx, [id]);
      const person = await loadVisiblePerson(tx, personScope(req.auth), id);
      assertEditableBy(person, req.auth.organizationId);
      // Condicional: nunca queda un código activo sobre una persona ya reclamada o fusionada.
      const r = await tx.person.updateMany({
        where: { id, ownerOrganizationId: req.auth.organizationId, mergedIntoId: null, user: { is: null } },
        data: { claimCodeHash: claim.hash, claimCodeExpiresAt: claim.expiresAt },
      });
      if (r.count !== 1) throw new AppError(409, "PERSON_CHANGED", "La persona cambió. Vuelve a cargarla.");
      await auditTx(tx, req, { action: "PERSON_CLAIM_CODE_ISSUED", entityType: "Person", entityId: id, organizationId: req.auth.organizationId, metadata: { expiresAt: claim.expiresAt.toISOString() } });
    });
    reply.header("Cache-Control", "no-store");
    // Se muestra una sola vez.
    return { code: formatCode(claim.code), expiresAt: claim.expiresAt };
  });

  /**
   * Desvinculación segura: corrige un código entregado a la persona equivocada. Solo la organización que emitió el
   * código (participant:manage, el mismo permiso que lo emite), con motivo y auditada en la misma transacción.
   * Revierte exactamente sus uniones: sus registros vuelven a su organización; la cuenta y su identidad no cambian.
   */
  // A6 (§8.2): desvincular y fusionar identidades son irreversibles para el titular → step-up.
  app.post("/:id/unlink-account", { preHandler: [app.requirePermission("participant:manage"), app.requireRecentMfa] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { reason } = unlinkAccountSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const r = await unlinkAccount(tx, personScope(req.auth), id, req.auth.id);
      await auditTx(tx, req, { action: "PERSON_ACCOUNT_UNLINKED", entityType: "Person", entityId: id, organizationId: req.auth.organizationId, metadata: { reason, ...r } });
      return r;
    });
    return { unlinked: true, userId: result.userId };
  });

  /**
   * Fusión explícita (nunca automática). Origen: registro propio de la organización, o la Person anterior de una cuenta
   * que reclamó una Person suya. Destino: registro propio o la Person de una cuenta. Si solo una tiene cuenta, la cuenta
   * queda en el destino; si ambas tienen cuenta, se rechaza. Los conflictos por evento abortan todo.
   */
  app.post("/:id/merge", { preHandler: [app.requirePermission("participant:manage"), app.requireRecentMfa] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { intoPersonId } = mergePersonSchema.parse(req.body);
    // Explícita (confirm: true), transaccional, con ambas Personas bloqueadas y auditada completa en la misma transacción.
    const result = await prisma.$transaction(async (tx) => {
      const moved = await mergePersons(tx, personScope(req.auth), id, intoPersonId);
      await auditTx(tx, req, { action: "PERSON_MERGED", entityType: "Person", entityId: id, organizationId: req.auth.organizationId, metadata: { intoPersonId, ...moved } });
      return moved;
    });
    return { mergedInto: intoPersonId, ...result };
  });
}
