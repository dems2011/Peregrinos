import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { effectivePermissions, type AssignmentView, type MeResponse, type Role } from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "./prisma";
import { newOpaqueToken } from "./tokens";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../plugins/auth";

export const cookieBase = { httpOnly: true, secure: cfg.COOKIE_SECURE, sameSite: "lax" as const };

/** Crea la sesión del personal: access token corto + refresh token opaco (rotativo) en cookies httpOnly. */
export async function issueSession(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply, user: { id: string; role: string }) {
  const accessToken = app.jwt.sign({ sub: user.id, role: user.role });
  const { raw, hash } = newOpaqueToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id, tokenHash: hash,
      expiresAt: new Date(Date.now() + cfg.REFRESH_TTL_DAYS * 86_400_000),
      userAgent: req.headers["user-agent"]?.slice(0, 300), ip: req.ip,
    },
  });
  reply.setCookie(ACCESS_COOKIE, accessToken, { ...cookieBase, path: "/", maxAge: cfg.ACCESS_TTL_MIN * 60 });
  reply.setCookie(REFRESH_COOKIE, raw, { ...cookieBase, path: "/api/auth", maxAge: cfg.REFRESH_TTL_DAYS * 86_400 });
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { path: "/" });
  reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}

export async function buildMe(userId: string): Promise<MeResponse> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const rows = await prisma.operatorAssignment.findMany({
    where: { userId, checkpoint: { status: "ACTIVE" } },
    include: { checkpoint: { include: { event: true } } },
  });
  const assignments: AssignmentView[] = rows
    .map((r) => ({
      checkpointId: r.checkpointId, checkpointName: r.checkpoint.name, order: r.checkpoint.order,
      eventId: r.eventId, eventName: r.checkpoint.event.name, eventStatus: r.checkpoint.event.status,
    }))
    .sort((a, b) => a.eventName.localeCompare(b.eventName) || a.order - b.order);

  // Punto actual: prioriza eventos "En curso", luego "Programado"; dentro del evento, el de menor orden.
  const rank = { IN_PROGRESS: 0, SCHEDULED: 1, FINISHED: 9, CANCELLED: 9 } as const;
  const current =
    [...assignments].filter((a) => rank[a.eventStatus] < 9).sort((a, b) => rank[a.eventStatus] - rank[b.eventStatus] || a.order - b.order)[0] ?? null;

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role as Role, organizationId: user.organizationId },
    permissions: effectivePermissions(user.role as Role, user.extraPermissions),
    assignments,
    currentCheckpoint: current,
  };
}
