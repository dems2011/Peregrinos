import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  CERTIFICATE_STATUSES, CERTIFICATE_STATUS_LABEL, CERTIFICATE_TRANSITIONS, certificateLookupSchema, certificateRequestSchema, certificateUpdateSchema,
} from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { audit, auditTx } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { sendCertificateUpdate } from "../lib/mailer";
import { certificateAccessHash, newTrackingCode } from "../lib/certificates";

const idParam = z.object({ id: z.string().uuid() });
const day = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00.000Z`) : null);
const statusUrl = () => `${cfg.WEB_ORIGIN}/certificados`;

/**
 * B5 — Solicitudes de certificados sacramentales para el personal (prefijo /api/organization/certificates).
 * Permiso certificate:manage; todo acotado a la organización. Gestiona el pedido: no reemplaza los libros sacramentales
 * ni valida documentos. Cada cambio queda en el historial y en la auditoría.
 */
export default async function certificateRoutes(app: FastifyInstance) {
  const manage = app.requirePermission("certificate:manage");

  app.get("/", { preHandler: manage }, async (req) => {
    const { status } = z.object({ status: z.enum(CERTIFICATE_STATUSES).optional() }).parse(req.query);
    const items = await prisma.certificateRequest.findMany({
      where: { organizationId: req.auth.organizationId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" }, take: 200,
      select: { id: true, trackingCode: true, type: true, status: true, requesterName: true, subjectName: true, createdAt: true, updatedAt: true },
    });
    const counts = await prisma.certificateRequest.groupBy({ by: ["status"], where: { organizationId: req.auth.organizationId }, _count: { _all: true } });
    return { items, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) };
  });

  app.get("/:id", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    const r = await prisma.certificateRequest.findFirst({
      where: { id, organizationId: req.auth.organizationId },
      include: { history: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } } },
    });
    if (!r) throw notFound("Solicitud no encontrada.");
    const { accessTokenHash: _h, history, ...rest } = r;
    await audit(req, { action: "CERTIFICATE_REQUEST_VIEWED", entityType: "CertificateRequest", entityId: id });
    return { ...rest, history: history.map((h) => ({ id: h.id, status: h.status, note: h.note, actor: h.actor?.name ?? null, createdAt: h.createdAt })) };
  });

  /** Cambiar el estado (transiciones válidas). Entregar exige confirmar la verificación de identidad. Avisa por correo. */
  app.patch("/:id", { preHandler: manage }, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = certificateUpdateSchema.parse(req.body);
    const r = await prisma.certificateRequest.findFirst({ where: { id, organizationId: req.auth.organizationId }, include: { organization: { select: { name: true } } } });
    if (!r) throw notFound("Solicitud no encontrada.");
    if (b.status !== r.status && !CERTIFICATE_TRANSITIONS[r.status].includes(b.status)) {
      throw new AppError(409, "INVALID_TRANSITION", `No se puede pasar de «${CERTIFICATE_STATUS_LABEL[r.status]}» a «${CERTIFICATE_STATUS_LABEL[b.status]}».`);
    }
    const final = b.status === "DELIVERED" || b.status === "REJECTED";
    await prisma.$transaction(async (tx) => {
      // Condicional sobre el estado leído: un cambio simultáneo no se pisa.
      const u = await tx.certificateRequest.updateMany({
        where: { id, status: r.status },
        data: { status: b.status, ...(b.publicMessage !== undefined ? { publicMessage: b.publicMessage } : {}), ...(final ? { closedAt: new Date() } : {}) },
      });
      if (u.count !== 1) throw new AppError(409, "STATUS_CHANGED", "La solicitud cambió mientras tanto. Vuelve a abrirla.");
      await tx.certificateRequestEvent.create({ data: { requestId: id, status: b.status, note: b.note ?? null, actorUserId: req.auth.id } });
      await auditTx(tx, req, { action: "CERTIFICATE_REQUEST_STATUS_CHANGED", entityType: "CertificateRequest", entityId: id, metadata: { from: r.status, to: b.status, identityVerified: b.identityVerified ?? false } });
    });
    if (b.status !== r.status) {
      void sendCertificateUpdate({ to: r.requesterEmail, parish: r.organization.name, code: r.trackingCode, statusLabel: CERTIFICATE_STATUS_LABEL[b.status], message: b.publicMessage ?? r.publicMessage, url: statusUrl() });
    }
    return { id, status: b.status };
  });
}

/**
 * B5 — Rutas públicas de certificados (prefijo /api/public). Pedir: solo a parroquias aprobadas, con límite de
 * frecuencia y trampa anti-spam. Consultar: código + correo (POST, nada en la URL); misma respuesta si algo no coincide.
 */
export async function certificatePublicRoutes(app: FastifyInstance) {
  app.post("/parishes/:id/certificates", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = certificateRequestSchema.parse(req.body);
    if (b.website) throw new AppError(400, "INVALID", "Solicitud no válida."); // trampa anti-spam
    const org = await prisma.organization.findFirst({ where: { id, status: "APPROVED" }, select: { id: true, name: true } });
    if (!org) throw notFound("Parroquia no encontrada.");
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newTrackingCode();
      try {
        const created = await prisma.$transaction(async (tx) => {
          const c = await tx.certificateRequest.create({
            data: {
              organizationId: org.id, trackingCode: code, type: b.type, requesterName: b.requesterName, requesterEmail: b.requesterEmail,
              requesterPhone: b.requesterPhone ?? null, requesterDocument: b.requesterDocument ?? null, subjectName: b.subjectName,
              subjectBirthDate: day(b.subjectBirthDate), sacramentYear: b.sacramentYear ?? null, sacramentPlace: b.sacramentPlace ?? null,
              parentsNames: b.parentsNames ?? null, spouseName: b.spouseName ?? null, purpose: b.purpose ?? null, details: b.details ?? null,
              accessTokenHash: certificateAccessHash(code, b.requesterEmail),
            },
            select: { id: true, trackingCode: true },
          });
          await tx.certificateRequestEvent.create({ data: { requestId: c.id, status: "RECEIVED" } });
          await auditTx(tx, req, { action: "CERTIFICATE_REQUEST_CREATED", entityType: "CertificateRequest", entityId: c.id, organizationId: org.id, metadata: { type: b.type } });
          return c;
        });
        const emailSent = await sendCertificateUpdate({ to: b.requesterEmail, parish: org.name, code: created.trackingCode, statusLabel: CERTIFICATE_STATUS_LABEL.RECEIVED, message: null, url: statusUrl(), created: true });
        reply.header("Cache-Control", "no-store");
        return reply.status(201).send({ trackingCode: created.trackingCode, emailSent });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // código repetido: otro
        throw e;
      }
    }
    throw new AppError(503, "TRY_AGAIN", "No se pudo registrar la solicitud. Intenta nuevamente.");
  });

  app.post("/certificates/lookup", { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const { code, email } = certificateLookupSchema.parse(req.body);
    const r = await prisma.certificateRequest.findUnique({
      where: { accessTokenHash: certificateAccessHash(code, email) },
      select: { trackingCode: true, type: true, status: true, publicMessage: true, createdAt: true, updatedAt: true, organization: { select: { name: true } } },
    });
    if (!r) throw notFound("No encontramos una solicitud con ese código y ese correo.");
    reply.header("Cache-Control", "no-store");
    return { trackingCode: r.trackingCode, type: r.type, status: r.status, publicMessage: r.publicMessage, createdAt: r.createdAt, updatedAt: r.updatedAt, parish: r.organization.name };
  });
}
