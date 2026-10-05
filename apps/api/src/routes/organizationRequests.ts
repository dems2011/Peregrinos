import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { organizationRequestSchema, resubmitOrganizationRequestSchema } from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { newOpaqueToken, sha256 } from "../lib/tokens";
import { sendOrganizationRequestReceived } from "../lib/mailer";
import { recordStatusChange } from "../lib/orgStatus";

/**
 * A3 — Solicitud pública de una nueva parroquia (sin cuenta previa).
 * No crea Organization ni otorga ningún rol: la solicitud queda PENDING_REVIEW hasta que un operador PLATFORM decide.
 * El solicitante recibe un token privado para consultar el estado y, si se rechaza, corregir y volver a presentar.
 */
const trackingUrl = (raw: string) => `${cfg.WEB_ORIGIN}/solicitud-parroquia?token=${raw}`;
const alreadyPending = () => new AppError(409, "REQUEST_ALREADY_PENDING", "Ya existe una solicitud pendiente para esta parroquia con este correo.");
// El índice único parcial "OrganizationRequest_pending_unique" cierra la carrera entre la comprobación previa y el insert.
const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const publicView = (r: { id: string; parishName: string; status: string; rejectionReason: string | null; submissionCount: number; createdAt: Date; updatedAt: Date }) => ({
  id: r.id, parishName: r.parishName, status: r.status, rejectionReason: r.rejectionReason,
  submissionCount: r.submissionCount, createdAt: r.createdAt, updatedAt: r.updatedAt,
});

export default async function organizationRequestRoutes(app: FastifyInstance) {
  // Varias parroquias pueden compartir IP (NAT); los envíos inválidos también cuentan.
  const submitLimit = { rateLimit: { max: 5, timeWindow: "1 hour" } };
  const readLimit = { rateLimit: { max: 30, timeWindow: "1 minute" } };

  app.post("/", { config: submitLimit }, async (req, reply) => {
    const { acceptTerms: _terms, ...body } = organizationRequestSchema.parse(req.body);
    const duplicate = await prisma.organizationRequest.findFirst({
      where: { status: "PENDING_REVIEW", contactEmail: body.contactEmail, parishName: { equals: body.parishName, mode: "insensitive" } },
    });
    if (duplicate) throw alreadyPending();

    const token = newOpaqueToken();
    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.organizationRequest.create({ data: { ...body, editTokenHash: token.hash, status: "PENDING_REVIEW" } });
      await recordStatusChange(tx, { requestId: created.id, fromStatus: null, toStatus: "PENDING_REVIEW", actor: null, reason: "Solicitud presentada" });
      return created;
    }).catch((e) => { throw isUniqueViolation(e) ? alreadyPending() : e; });
    const emailSent = await sendOrganizationRequestReceived({ to: request.contactEmail, name: request.contactName, parishName: request.parishName, url: trackingUrl(token.raw) });
    await audit(req, { action: "ORGANIZATION_REQUEST_SUBMITTED", entityType: "OrganizationRequest", entityId: request.id, metadata: { countryCode: request.countryCode } });
    // El enlace privado también se devuelve al solicitante: si el correo no llega (sin SMTP), puede guardarlo.
    return reply.status(201).send({ request: publicView(request), trackingUrl: trackingUrl(token.raw), emailSent });
  });

  app.get("/status", { config: readLimit }, async (req) => {
    const { token } = z.object({ token: z.string().min(20).max(200) }).strict().parse(req.query);
    const request = await prisma.organizationRequest.findUnique({ where: { editTokenHash: sha256(token) } });
    if (!request) throw notFound("Solicitud no encontrada.");
    return { request: publicView(request) };
  });

  /** Corrección y nueva presentación: solo desde REJECTED, con el token privado del solicitante. */
  app.post("/resubmit", { config: submitLimit }, async (req) => {
    const { token, ...fields } = resubmitOrganizationRequestSchema.parse(req.body);
    const current = await prisma.organizationRequest.findUnique({ where: { editTokenHash: sha256(token) } });
    if (!current) throw notFound("Solicitud no encontrada.");
    if (current.status !== "REJECTED") {
      throw new AppError(409, "REQUEST_NOT_REJECTED", "Solo una solicitud rechazada puede corregirse y volver a presentarse.");
    }
    const updated = await prisma.$transaction(async (tx) => {
      // Reclamo atómico: dos envíos simultáneos no pueden reabrirla dos veces.
      const claimed = await tx.organizationRequest.updateMany({
        where: { id: current.id, status: "REJECTED" },
        data: { ...fields, status: "PENDING_REVIEW", rejectionReason: null, reviewedById: null, reviewedAt: null, submissionCount: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new AppError(409, "REQUEST_NOT_REJECTED", "La solicitud cambió de estado. Vuelve a consultarla.");
      await recordStatusChange(tx, {
        requestId: current.id, fromStatus: "REJECTED", toStatus: "PENDING_REVIEW", actor: null,
        reason: `Nueva presentación tras corrección (motivo anterior: ${current.rejectionReason ?? "—"})`,
      });
      return tx.organizationRequest.findUniqueOrThrow({ where: { id: current.id } });
    }).catch((e) => { throw isUniqueViolation(e) ? alreadyPending() : e; });
    await audit(req, { action: "ORGANIZATION_REQUEST_RESUBMITTED", entityType: "OrganizationRequest", entityId: updated.id });
    return { request: publicView(updated) };
  });
}
