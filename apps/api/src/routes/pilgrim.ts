import type { FastifyInstance } from "fastify";
import { publish } from "../lib/bus";
import QRCode from "qrcode";
import {
  pilgrimLoginSchema, proofFieldsSchema, qrContent, type PilgrimMe, type PilgrimRegistrationMe, type RegistrationStatus,
} from "@peregrinos/shared";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, unauthorized } from "../lib/errors";
import { newOpaqueToken, sha256 } from "../lib/tokens";
import { hashAccess, normalizeCode } from "../lib/pilgrim";
import { cookieBase } from "../lib/session";
import { saveProof } from "../lib/storage";
import { assertEventCapability } from "../lib/eventLifecycle";
import { PILGRIM_COOKIE } from "../plugins/auth";

const COOKIE_PATH = "/api/pilgrim";
const maskDoc = (d: string) => (d.length > 3 ? `${"•".repeat(d.length - 3)}${d.slice(-3)}` : d);

const contactsOf = async (eventId: string): Promise<PilgrimMe["contacts"]> => {
  const rows = await prisma.eventContact.findMany({
    where: { eventId }, orderBy: [{ isEmergency: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { checkpoint: { select: { name: true } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, roleLabel: c.roleLabel, phone: c.phone, email: c.email, notes: c.notes, isEmergency: c.isEmergency, checkpointName: c.checkpoint?.name ?? null }));
};

/** Participante oficial: solo datos propios + información del evento. Nada de otros participantes. */
async function buildPilgrimMe(participantId: string): Promise<PilgrimMe> {
  const p = await prisma.participant.findUniqueOrThrow({ where: { id: participantId }, include: { event: true } });
  const [cps, mine, contacts] = await Promise.all([
    prisma.checkpoint.findMany({ where: { eventId: p.eventId, status: "ACTIVE" }, orderBy: { order: "asc" } }),
    prisma.checkin.findMany({ where: { eventId: p.eventId, participantId, status: "ACTIVE" } }),
    contactsOf(p.eventId),
  ]);
  const at = new Map(mine.map((c) => [c.checkpointId, c.timestamp]));
  const route = cps.map((c) => ({
    checkpointId: c.id, order: c.order, name: c.name, address: c.address, reference: c.reference,
    latitude: c.latitude, longitude: c.longitude, arrived: at.has(c.id), timestamp: at.get(c.id)?.toISOString() ?? null,
  }));
  const done = route.filter((r) => r.arrived).length;
  return {
    stage: "OFFICIAL",
    participant: { number: p.number, firstName: p.firstName, lastName: p.lastName, documentMasked: maskDoc(p.documentNumber) },
    qrContent: qrContent(p.qrToken),
    event: { id: p.event.id, name: p.event.name, description: p.event.description, startsAt: p.event.startsAt.toISOString(), status: p.event.status, timezone: p.event.timezone,
      type: p.event.type, endsAt: p.event.endsAt?.toISOString() ?? null, locationName: p.event.locationName, address: p.event.address },
    route,
    progress: { done, total: route.length, percent: route.length ? Math.round((done / route.length) * 100) : 0 },
    contacts,
  };
}

/** Inscripción en trámite: estado del pago, motivo de rechazo si lo hubo y datos para pagar. */
export async function buildRegistrationMe(registrationId: string): Promise<PilgrimRegistrationMe> {
  const r = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { event: { include: { organization: true } }, proofs: { orderBy: { createdAt: "desc" }, select: { createdAt: true } } },
  });
  return {
    stage: "REGISTRATION",
    registration: {
      firstName: r.firstName, lastName: r.lastName, documentMasked: maskDoc(r.documentNumber), status: r.status as RegistrationStatus,
      rejectionReason: r.status === "REJECTED" ? r.rejectionReason : null, proofsSent: r.proofs.length, lastProofAt: r.proofs[0]?.createdAt.toISOString() ?? null,
    },
    event: {
      id: r.event.id, name: r.event.name, parishName: r.event.parishName ?? r.event.organization.name, startsAt: r.event.startsAt.toISOString(),
      registrationFee: r.event.registrationFee?.toString() ?? null, paymentInstructions: r.event.paymentInstructions,
      type: r.event.type, endsAt: r.event.endsAt?.toISOString() ?? null, locationName: r.event.locationName, address: r.event.address,
    },
    contacts: await contactsOf(r.eventId),
  };
}

export default async function pilgrimRoutes(app: FastifyInstance) {
  const strict = { rateLimit: { max: 10, timeWindow: "1 minute" } };

  const me = async (a: { participantId?: string; registrationId?: string }) =>
    a.participantId ? buildPilgrimMe(a.participantId) : buildRegistrationMe(a.registrationId!);

  /** Entra con el enlace personal (token) o con el código corto. Sirve antes y después de ser verificado. */
  app.post("/login", { config: strict }, async (req, reply) => {
    const body = pilgrimLoginSchema.parse(req.body);
    const hash = body.token ? hashAccess(body.token) : hashAccess(normalizeCode(body.code!));
    const by = body.token ? { accessTokenHash: hash } : { accessCodeHash: hash };

    let participantId: string | undefined, registrationId: string | undefined;
    const p = await prisma.participant.findUnique({ where: by });
    if (p && p.status === "ACTIVE") participantId = p.id;
    else if (!p) {
      const r = await prisma.registration.findUnique({ where: by });
      if (r && r.status !== "CANCELLED") registrationId = r.id;
    }
    if (!participantId && !registrationId) throw unauthorized("Enlace o código no válido. Pide uno nuevo a la organización.");

    const s = newOpaqueToken();
    await prisma.pilgrimSession.create({
      data: {
        participantId, registrationId, tokenHash: s.hash, expiresAt: new Date(Date.now() + cfg.PILGRIM_SESSION_DAYS * 86_400_000),
        userAgent: req.headers["user-agent"]?.slice(0, 300), ip: req.ip,
      },
    });
    reply.setCookie(PILGRIM_COOKIE, s.raw, { ...cookieBase, path: COOKIE_PATH, maxAge: cfg.PILGRIM_SESSION_DAYS * 86_400 });
    reply.header("Cache-Control", "no-store");
    return me({ participantId, registrationId });
  });

  app.get("/me", { preHandler: app.authenticatePilgrim }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    return me(req.pilgrim);
  });

  /** QR en SVG, para guardarlo en el teléfono (PWA) y mostrarlo sin internet. Solo participantes ya verificados. */
  app.get("/qr.svg", { preHandler: app.authenticatePilgrim }, async (req, reply) => {
    if (!req.pilgrim.participantId) throw new AppError(409, "NOT_VERIFIED", "Tu QR estará disponible cuando la organización confirme tu pago.");
    const p = await prisma.participant.findUniqueOrThrow({ where: { id: req.pilgrim.participantId } });
    reply.header("Content-Type", "image/svg+xml");
    reply.header("Cache-Control", "private, no-store");
    return reply.send(await QRCode.toString(qrContent(p.qrToken), { type: "svg", margin: 2, errorCorrectionLevel: "M" }));
  });

  /**
   * Envío del comprobante de pago (multipart: campos opcionales amount, reference, paidAt, note + archivo).
   * Puede reenviarse si fue rechazado o si se equivocó de archivo.
   */
  app.post("/payment-proof", { preHandler: app.authenticatePilgrim, config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req, reply) => {
    const regId = req.pilgrim.registrationId;
    if (!regId) throw new AppError(409, "NOT_APPLICABLE", "Tu inscripción ya fue verificada: no necesitas enviar comprobante.");
    const reg = await prisma.registration.findUniqueOrThrow({
      where: { id: regId },
      include: { _count: { select: { proofs: true } }, event: { select: { status: true, capabilities: true, organizationId: true } } },
    });
    if (!["PENDING_PROOF", "IN_REVIEW", "REJECTED"].includes(reg.status)) throw new AppError(409, "NOT_APPLICABLE", "No se pueden enviar comprobantes en este estado.");
    // A4: como aprobar y reabrir, el comprobante (→ IN_REVIEW) respeta el ciclo de vida del evento y su capacidad.
    if (reg.event.status === "FINISHED" || reg.event.status === "CANCELLED") throw new AppError(409, "EVENT_CLOSED", "El evento ya terminó o fue cancelado.");
    assertEventCapability(reg.event, "REGISTRATION");
    if (reg._count.proofs >= 10) throw new AppError(429, "TOO_MANY_PROOFS", "Llegaste al máximo de envíos. Contacta a la organización.");

    const fields: Record<string, string> = {};
    let file: Buffer | null = null;
    for await (const part of req.parts()) {
      if (part.type === "file") file = await part.toBuffer();
      else fields[part.fieldname] = String(part.value ?? "");
    }
    if (!file || file.length === 0) throw new AppError(400, "NO_FILE", "Adjunta la foto o el PDF del comprobante.");
    const data = proofFieldsSchema.parse(fields);

    const saved = await saveProof(file);
    if (await prisma.paymentProof.findFirst({ where: { registrationId: regId, sha256: saved.sha256 } })) {
      throw new AppError(409, "DUPLICATE_FILE", "Ya enviaste este mismo archivo.");
    }
    await prisma.$transaction(async (tx) => {
      // A4: PENDING_PROOF/IN_REVIEW/REJECTED → IN_REVIEW, condicional: si una aprobación o cancelación se adelantó, no se pisa.
      const claimed = await tx.registration.updateMany({
        where: { id: regId, status: { in: ["PENDING_PROOF", "IN_REVIEW", "REJECTED"] } },
        data: { status: "IN_REVIEW", rejectionReason: null },
      });
      if (claimed.count !== 1) throw new AppError(409, "NOT_APPLICABLE", "No se pueden enviar comprobantes en este estado.");
      await tx.paymentProof.create({
        data: { registrationId: regId, storageKey: saved.key, mimeType: saved.mime, sizeBytes: saved.size, sha256: saved.sha256, amount: data.amount, reference: data.reference, paidAt: data.paidAt, note: data.note },
      });
    });
    await audit(req, { action: "PAYMENT_PROOF_SUBMITTED", entityType: "Registration", entityId: regId, eventId: reg.eventId, organizationId: reg.event.organizationId, metadata: { mime: saved.mime, bytes: saved.size } });
    publish(reg.eventId, { type: "registration.updated", data: { registrationId: regId, status: "IN_REVIEW" } });
    reply.header("Cache-Control", "no-store");
    return reply.status(201).send(await buildRegistrationMe(regId));
  });

  app.post("/logout", async (req, reply) => {
    const raw = req.cookies[PILGRIM_COOKIE];
    if (raw) await prisma.pilgrimSession.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
    reply.clearCookie(PILGRIM_COOKIE, { path: COOKIE_PATH });
    return reply.status(204).send();
  });
}
