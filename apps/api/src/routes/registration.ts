import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { publish } from "../lib/bus";
import { z, ZodError } from "zod";
import { createRegistrationSchema, deriveRegistrationState, digitsOnly, normalizeDocument, validateRegistrationAnswers } from "@peregrinos/shared";
import { eventFormFields } from "./public";
import { Prisma } from "@prisma/client";
import { cfg } from "../config";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, notFound } from "../lib/errors";
import { formatCode, hashAccess, newAccessCode, newAccessToken } from "../lib/pilgrim";
import { newOpaqueToken } from "../lib/tokens";
import { cookieBase } from "../lib/session";
import { PILGRIM_ACCOUNT_COOKIE, PILGRIM_COOKIE } from "../plugins/auth";
import { buildRegistrationMe } from "./pilgrim";

/** Inscripción pública: el peregrino se registra con el enlace que comparte la organización. */
export default async function registrationRoutes(app: FastifyInstance) {
  async function openEvent(token: string) {
    const event = await prisma.event.findUnique({ where: { registrationToken: token }, include: { organization: true } });
    // A3: solo las parroquias aprobadas reciben inscripciones públicas.
    if (!event || event.organization.status !== "APPROVED") throw notFound("La inscripción no está disponible. Consulta con la organización.");
    // A4: estado derivado; el cupo cuenta solo participantes ACTIVE (las inscripciones pendientes no lo consumen).
    const activeParticipants = await prisma.participant.count({ where: { eventId: event.id, status: "ACTIVE" } });
    const state = deriveRegistrationState({ ...event, activeParticipants });
    if (state === "FULL") throw new AppError(409, "EVENT_FULL", "El cupo del evento está completo. Consulta con la organización.");
    if (state !== "OPEN") throw notFound("La inscripción no está disponible. Consulta con la organización.");
    return event;
  }

  app.get("/info", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(req.query);
    const e = await openEvent(token);
    return {
      event: {
        name: e.name, description: e.description, startsAt: e.startsAt, parishName: e.parishName ?? e.organization.name,
        type: e.type, endsAt: e.endsAt, locationName: e.locationName, address: e.address, timezone: e.timezone,
        organizationId: e.organizationId,
      },
      registrationFee: e.registrationFee?.toString() ?? null,
      paymentInstructions: e.paymentInstructions,
      // B1: preguntas extra del formulario de este evento (los datos básicos son fijos).
      fields: eventFormFields(e.registrationFields),
    };
  });

  /** B1: cuenta de peregrino con sesión abierta (opcional): la inscripción se vincula a su cuenta y a su Person. */
  async function accountOf(req: FastifyRequest, reply: FastifyReply) {
    if (!req.cookies[PILGRIM_ACCOUNT_COOKIE]) return null;
    try { await app.authenticatePilgrimAccount(req, reply); } catch { return null; }
    const u = await prisma.user.findUnique({ where: { id: req.pilgrimAccount.id }, select: { id: true, personId: true } });
    return u?.personId ? { userId: u.id, personId: u.personId } : null;
  }

  /** Crea la inscripción, entrega el acceso personal (se muestra una vez) e inicia la sesión del peregrino. */
  app.post("/", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (req, reply) => {
    const body = createRegistrationSchema.parse(req.body);
    const event = await openEvent(body.token);
    const documentNumber = normalizeDocument(body.documentNumber);
    // B1: preguntas extra del evento (validadas contra su definición; solo se guardan las conocidas).
    const checked = validateRegistrationAnswers(eventFormFields(event.registrationFields), body.answers);
    if (!checked.ok) throw new ZodError(checked.issues.map((i) => ({ code: "custom" as const, path: ["answers", i.field], message: i.message })));
    const account = await accountOf(req, reply);

    const [dupReg, dupPart, dupPerson] = await Promise.all([
      prisma.registration.findUnique({ where: { eventId_documentNumber: { eventId: event.id, documentNumber } } }),
      prisma.participant.findUnique({ where: { eventId_documentNumber: { eventId: event.id, documentNumber } } }),
      account
        ? prisma.registration.findFirst({ where: { eventId: event.id, OR: [{ personId: account.personId }, { userId: account.userId }] }, select: { id: true } })
          .then(async (r) => r ?? prisma.participant.findFirst({ where: { eventId: event.id, personId: account.personId }, select: { id: true } }))
        : Promise.resolve(null),
    ]);
    if (dupReg || dupPart || dupPerson) {
      throw new AppError(409, "ALREADY_REGISTERED", "Ya existe una inscripción con ese documento. Entra con tu enlace o código; si lo perdiste, pídelo a la organización.");
    }

    const token = newAccessToken(), code = newAccessCode();
    const session = newOpaqueToken();
    try {
      const reg = await prisma.registration.create({
        data: {
          event: { connect: { id: event.id } }, firstName: body.firstName, lastName: body.lastName, documentNumber,
          phone: body.phone, phoneDigits: digitsOnly(body.phone),
          // A4a: la inscripción pertenece a una Person (sin cuenta) de la organización del evento, creada en la misma
          // transacción. Sin fusiones: el inscrito no puede confirmar identidades; el personal fusiona después si corresponde.
          // B1: con cuenta abierta, la inscripción es de su Person (identidad global) y queda vinculada a la cuenta.
          person: account
            ? { connect: { id: account.personId } }
            : {
                create: {
                  firstName: body.firstName, lastName: body.lastName, documentType: "DNI", documentNumber,
                  phone: body.phone, phoneDigits: digitsOnly(body.phone), ownerOrganization: { connect: { id: event.organizationId } },
                },
              },
          ...(account ? { user: { connect: { id: account.userId } } } : {}),
          formAnswers: checked.answers,
          accessTokenHash: hashAccess(token), accessCodeHash: hashAccess(code),
          pilgrimSessions: {
            create: {
              tokenHash: session.hash, expiresAt: new Date(Date.now() + cfg.PILGRIM_SESSION_DAYS * 86_400_000),
              userAgent: req.headers["user-agent"]?.slice(0, 300), ip: req.ip,
            },
          },
        },
      });
      reply.setCookie(PILGRIM_COOKIE, session.raw, { ...cookieBase, path: "/api/pilgrim", maxAge: cfg.PILGRIM_SESSION_DAYS * 86_400 });
      reply.header("Cache-Control", "no-store");
      await audit(req, { action: "REGISTRATION_CREATED", entityType: "Registration", entityId: reg.id, eventId: event.id, organizationId: event.organizationId });
      publish(event.id, { type: "registration.updated", data: { registrationId: reg.id, status: "PENDING_PROOF" } });
      return reply.status(201).send({
        // Se muestran una sola vez: la app debe pedirle que los guarde.
        access: { link: `${cfg.WEB_ORIGIN}/p/${token}`, code: formatCode(code) },
        me: await buildRegistrationMe(reg.id),
        linkedToAccount: !!account,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppError(409, "ALREADY_REGISTERED", "Ya existe una inscripción con ese documento.");
      }
      throw e;
    }
  });
}
