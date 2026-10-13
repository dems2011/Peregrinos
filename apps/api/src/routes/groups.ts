import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { attendanceSchema, groupMeetingSchema, groupMemberSchema, pastoralGroupSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";

const idParam = z.object({ id: z.string().uuid() });
const memberParam = idParam.extend({ memberId: z.string().uuid() });
const meetingParam = idParam.extend({ meetingId: z.string().uuid() });
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const memberData = (b: z.infer<typeof groupMemberSchema>) => ({
  name: b.name, phone: b.phone ?? null, email: b.email ?? null, role: b.role ?? null, isMinor: b.isMinor ?? false,
  guardianName: b.guardianName ?? null, guardianPhone: b.guardianPhone ?? null, active: b.active ?? true,
});

/**
 * B5 — Grupos pastorales y asistencia (prefijo /api/organization/groups). Permiso group:manage; nunca público. La
 * asistencia de los encuentros es propia del grupo: no se mezcla con los check-in de eventos ni con el seguimiento GPS.
 * Menores: se exige un adulto responsable y sus datos solo los ve el personal autorizado.
 */
export default async function groupRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("group:manage");
  const ownGroup = async (req: FastifyRequest, id: string) => {
    const g = await prisma.pastoralGroup.findFirst({ where: { id, organizationId: req.auth.organizationId } });
    if (!g) throw notFound("Grupo no encontrado.");
    return g;
  };

  app.get("/", { preHandler: manage }, async (req) => {
    const groups = await prisma.pastoralGroup.findMany({
      where: { organizationId: req.auth.organizationId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { members: { where: { active: true } }, meetings: true } } },
    });
    return { items: groups.map(({ _count, ...g }) => ({ ...g, memberCount: _count.members, meetingCount: _count.meetings })) };
  });

  app.post("/", { preHandler: manage }, async (req, reply) => {
    const b = pastoralGroupSchema.parse(req.body);
    const g = await prisma.pastoralGroup.create({ data: { organizationId: req.auth.organizationId, name: b.name, kind: b.kind, description: b.description ?? null, leaders: b.leaders ?? null, active: b.active ?? true } });
    await audit(req, { action: "PASTORAL_GROUP_CREATED", entityType: "PastoralGroup", entityId: g.id });
    return reply.status(201).send(g);
  });

  app.get("/:id", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    const g = await ownGroup(req, id);
    const [members, meetings] = await Promise.all([
      prisma.pastoralGroupMember.findMany({ where: { groupId: id }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
      prisma.pastoralGroupMeeting.findMany({ where: { groupId: id }, orderBy: { date: "desc" }, take: 100, include: { attendance: { select: { memberId: true, present: true } } } }),
    ]);
    return { group: g, members, meetings: meetings.map(({ attendance, ...m }) => ({ ...m, present: attendance.filter((a) => a.present).length, recorded: attendance.length, attendance })) };
  });

  app.put("/:id", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = pastoralGroupSchema.parse(req.body);
    await ownGroup(req, id);
    const g = await prisma.pastoralGroup.update({ where: { id }, data: { name: b.name, kind: b.kind, description: b.description ?? null, leaders: b.leaders ?? null, active: b.active ?? true } });
    await audit(req, { action: "PASTORAL_GROUP_UPDATED", entityType: "PastoralGroup", entityId: id });
    return g;
  });

  /* ---------- Miembros ---------- */
  app.post("/:id/members", { preHandler: manage }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = groupMemberSchema.parse(req.body);
    await ownGroup(req, id);
    const m = await prisma.pastoralGroupMember.create({ data: { groupId: id, ...memberData(b) } });
    await audit(req, { action: "PASTORAL_MEMBER_ADDED", entityType: "PastoralGroupMember", entityId: m.id, metadata: { groupId: id, isMinor: m.isMinor } });
    return reply.status(201).send(m);
  });

  app.put("/:id/members/:memberId", { preHandler: manage }, async (req) => {
    const { id, memberId } = memberParam.parse(req.params);
    const b = groupMemberSchema.parse(req.body);
    await ownGroup(req, id);
    const r = await prisma.pastoralGroupMember.updateMany({ where: { id: memberId, groupId: id }, data: memberData(b) });
    if (r.count !== 1) throw notFound("Miembro no encontrado.");
    await audit(req, { action: "PASTORAL_MEMBER_UPDATED", entityType: "PastoralGroupMember", entityId: memberId, metadata: { groupId: id, active: b.active ?? true } });
    return prisma.pastoralGroupMember.findUniqueOrThrow({ where: { id: memberId } });
  });

  /* ---------- Encuentros y asistencia ---------- */
  app.post("/:id/meetings", { preHandler: manage }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = groupMeetingSchema.parse(req.body);
    await ownGroup(req, id);
    const m = await prisma.pastoralGroupMeeting.create({ data: { groupId: id, date: day(b.date), topic: b.topic ?? null, notes: b.notes ?? null, createdById: req.auth.id } });
    await audit(req, { action: "PASTORAL_MEETING_CREATED", entityType: "PastoralGroupMeeting", entityId: m.id, metadata: { groupId: id } });
    return reply.status(201).send(m);
  });

  app.delete("/:id/meetings/:meetingId", { preHandler: manage }, async (req, reply) => {
    const { id, meetingId } = meetingParam.parse(req.params);
    await ownGroup(req, id);
    const r = await prisma.pastoralGroupMeeting.deleteMany({ where: { id: meetingId, groupId: id } });
    if (r.count !== 1) throw notFound("Encuentro no encontrado.");
    await audit(req, { action: "PASTORAL_MEETING_DELETED", entityType: "PastoralGroupMeeting", entityId: meetingId, metadata: { groupId: id } });
    return reply.status(204).send();
  });

  /** Tomar asistencia: reemplaza la lista del encuentro. Solo miembros de ESTE grupo. */
  app.put("/:id/meetings/:meetingId/attendance", { preHandler: manage }, async (req) => {
    const { id, meetingId } = meetingParam.parse(req.params);
    const { items } = attendanceSchema.parse(req.body);
    await ownGroup(req, id);
    const meeting = await prisma.pastoralGroupMeeting.findFirst({ where: { id: meetingId, groupId: id }, select: { id: true } });
    if (!meeting) throw notFound("Encuentro no encontrado.");
    const ids = [...new Set(items.map((i) => i.memberId))];
    const valid = await prisma.pastoralGroupMember.count({ where: { id: { in: ids }, groupId: id } });
    if (valid !== ids.length) throw new AppError(400, "INVALID_MEMBER", "Hay personas que no son de este grupo.");
    await prisma.$transaction(async (tx) => {
      await tx.pastoralAttendance.deleteMany({ where: { meetingId } });
      if (items.length) await tx.pastoralAttendance.createMany({ data: items.map((i) => ({ meetingId, memberId: i.memberId, present: i.present })), skipDuplicates: true });
      await auditTx(tx, req, { action: "PASTORAL_ATTENDANCE_RECORDED", entityType: "PastoralGroupMeeting", entityId: meetingId, metadata: { groupId: id, present: items.filter((i) => i.present).length, total: items.length } });
    });
    return { meetingId, present: items.filter((i) => i.present).length, total: items.length };
  });
}
