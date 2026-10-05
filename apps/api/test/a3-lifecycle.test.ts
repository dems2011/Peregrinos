/**
 * A3 — Ciclo de vida de organizaciones y operador de plataforma. Tests sin base de datos.
 * La migración sobre datos heredados y el E2E se ejecutan contra PostgreSQL local (PGlite).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ORGANIZATION_STATUSES, organizationRequestSchema, organizationTransitionSchema, platformRejectSchema,
  resubmitOrganizationRequestSchema, type OrganizationStatus,
} from "@peregrinos/shared";
import { ORG_TRANSITIONS, assertOrgCan, assertOrgTransition, orgCan } from "../src/lib/orgLifecycle";
import { assertInvitationAcceptable } from "../src/lib/roles";
import { redactUrl, reqSerializer } from "../src/lib/logRedact";
import Fastify from "fastify";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("A3: transiciones de estado", () => {
  const allowed = new Set(ORG_TRANSITIONS.map((t) => `${t.from}>${t.to}`));
  it("exactamente las transiciones definidas", () => {
    assert.deepEqual([...allowed].sort(), [
      "APPROVED>ARCHIVED", "APPROVED>SUSPENDED", "DRAFT>PENDING_REVIEW", "PENDING_REVIEW>APPROVED",
      "PENDING_REVIEW>REJECTED", "REJECTED>PENDING_REVIEW", "SUSPENDED>PENDING_REVIEW",
    ]);
  });
  it("cualquier otra transición se rechaza (409)", () => {
    for (const from of ORGANIZATION_STATUSES) for (const to of ORGANIZATION_STATUSES) {
      if (allowed.has(`${from}>${to}`)) continue;
      for (const actor of ["PLATFORM", "ORG_SUPERADMIN"] as const) assert.throws(() => assertOrgTransition(from, to, actor, "motivo"), /Transición no permitida/, `${from}>${to}`);
    }
  });
  it("SUSPENDED nunca vuelve directo a APPROVED; pasa por revisión controlada por PLATFORM", () => {
    assert.throws(() => assertOrgTransition("SUSPENDED", "APPROVED", "PLATFORM", "x"), /no permitida/);
    assert.doesNotThrow(() => assertOrgTransition("SUSPENDED", "PENDING_REVIEW", "PLATFORM", "revisión"));
    assert.throws(() => assertOrgTransition("SUSPENDED", "PENDING_REVIEW", "ORG_SUPERADMIN", "x"), /no está permitida para este tipo/);
  });
  it("aprobar/rechazar/suspender/archivar solo PLATFORM; presentar solo el SUPERADMIN de la parroquia", () => {
    assert.throws(() => assertOrgTransition("PENDING_REVIEW", "APPROVED", "ORG_SUPERADMIN"), /no está permitida para este tipo/);
    assert.throws(() => assertOrgTransition("APPROVED", "SUSPENDED", "ORG_SUPERADMIN", "x"), /no está permitida para este tipo/);
    assert.throws(() => assertOrgTransition("DRAFT", "PENDING_REVIEW", "PLATFORM"), /no está permitida para este tipo/);
    assert.doesNotThrow(() => assertOrgTransition("REJECTED", "PENDING_REVIEW", "ORG_SUPERADMIN"));
  });
  it("rechazar, suspender y reabrir exigen motivo", () => {
    assert.throws(() => assertOrgTransition("PENDING_REVIEW", "REJECTED", "PLATFORM", "  "), /requiere un motivo/);
    assert.throws(() => assertOrgTransition("APPROVED", "SUSPENDED", "PLATFORM"), /requiere un motivo/);
    assert.throws(() => assertOrgTransition("SUSPENDED", "PENDING_REVIEW", "PLATFORM"), /requiere un motivo/);
  });
});

describe("A3: permisos por estado", () => {
  const matrix: Record<OrganizationStatus, string[]> = {
    DRAFT: ["WRITE", "SUBMIT_REVIEW"],
    PENDING_REVIEW: ["WRITE"],
    APPROVED: ["WRITE", "PUBLISH_EVENT", "OPEN_REGISTRATION", "INVITE_STAFF"],
    REJECTED: ["WRITE", "SUBMIT_REVIEW"],
    SUSPENDED: [],
    ARCHIVED: [],
  };
  for (const status of ORGANIZATION_STATUSES) {
    it(`${status}: ${matrix[status].join(", ") || "solo lectura"}`, () => {
      for (const cap of ["WRITE", "PUBLISH_EVENT", "OPEN_REGISTRATION", "INVITE_STAFF", "SUBMIT_REVIEW"] as const) {
        assert.equal(orgCan(status, cap), matrix[status].includes(cap), `${status}/${cap}`);
      }
    });
  }
  it("el error de solo lectura es ORGANIZATION_READ_ONLY", () => assert.throws(() => assertOrgCan("SUSPENDED", "WRITE"), (e: { code?: string }) => e.code === "ORGANIZATION_READ_ONLY"));
});

describe("A3: invitación de fundador", () => {
  const base = { role: "SUPERADMIN" as const, platformGrant: true, inviterAccountType: "PLATFORM", organizationStatus: "APPROVED" as const };
  it("PLATFORM + platformGrant + organización aprobada → se acepta", () => assert.doesNotThrow(() => assertInvitationAcceptable(base)));
  it("SUPERADMIN sin platformGrant (invitación del personal o heredada) → rechazada", () =>
    assert.throws(() => assertInvitationAcceptable({ ...base, platformGrant: false, inviterAccountType: "STAFF" }), /superadministrador/));
  it("platformGrant emitido por una cuenta que no es PLATFORM → rechazada", () =>
    assert.throws(() => assertInvitationAcceptable({ ...base, inviterAccountType: "STAFF" })));
  it("organización no aprobada → ninguna invitación se acepta", () => {
    for (const s of ["DRAFT", "PENDING_REVIEW", "REJECTED", "SUSPENDED", "ARCHIVED"] as const) {
      assert.throws(() => assertInvitationAcceptable({ ...base, organizationStatus: s }), /no está habilitada/);
      assert.throws(() => assertInvitationAcceptable({ role: "OPERATOR", platformGrant: false, inviterAccountType: "STAFF", organizationStatus: s }), /no está habilitada/);
    }
  });
  it("invitación normal del personal a organización aprobada → se acepta", () =>
    assert.doesNotThrow(() => assertInvitationAcceptable({ role: "ADMIN", platformGrant: false, inviterAccountType: "STAFF", organizationStatus: "APPROVED" })));
});

describe("A3: esquemas estrictos", () => {
  const req = { parishName: "Parroquia San José", contactName: "Ana", contactEmail: "ana@ejemplo.org", countryCode: "ar", acceptTerms: true as const };
  it("acepta una solicitud válida y normaliza el país a ISO-2 mayúsculas", () => {
    const r = organizationRequestSchema.safeParse(req);
    assert.ok(r.success && r.data.countryCode === "AR");
  });
  for (const extra of [{ status: "APPROVED" }, { organizationId: "x" }, { role: "SUPERADMIN" }, { accountType: "PLATFORM" }, { platformGrant: true }]) {
    it(`rechaza ${JSON.stringify(extra)}`, () => assert.equal(organizationRequestSchema.safeParse({ ...req, ...extra }).success, false));
  }
  it("rechaza país que no es ISO-2", () => assert.equal(organizationRequestSchema.safeParse({ ...req, countryCode: "ARG" }).success, false));
  it("la nueva presentación no permite cambiar el estado", () =>
    assert.equal(resubmitOrganizationRequestSchema.safeParse({ ...req, acceptTerms: undefined, token: "x".repeat(30), status: "APPROVED" }).success, false));
  it("rechazo exige motivo; transición no acepta campos extra", () => {
    assert.equal(platformRejectSchema.safeParse({ reason: "" }).success, false);
    assert.equal(organizationTransitionSchema.safeParse({ to: "SUSPENDED", reason: "x", organizationId: "y" }).success, false);
  });
});

describe("A3: migraciones", () => {
  const m1 = read("prisma/migrations/20261007000000_platform_account_type/migration.sql");
  const m2 = read("prisma/migrations/20261007000100_organization_lifecycle/migration.sql");
  it("el valor PLATFORM se agrega en su propia migración (no en la del CHECK)", () => {
    assert.match(m1, /ALTER TYPE "AccountType" ADD VALUE 'PLATFORM';/);
    assert.doesNotMatch(m2, /ADD VALUE/);
  });
  it("las organizaciones existentes quedan APPROVED y las nuevas nacen DRAFT", () => {
    assert.match(m2, /ADD COLUMN\s+"status" "OrganizationStatus" NOT NULL DEFAULT 'APPROVED';\s*\nALTER TABLE "Organization" ALTER COLUMN "status" SET DEFAULT 'DRAFT';/);
  });
  it("CHECKs: PLATFORM sin autorización parroquial; fundador solo SUPERADMIN; solicitudes coherentes", () => {
    for (const c of ["User_platform_without_org_authz", "Invitation_platform_grant_is_superadmin", "OrganizationRequest_status_valid",
      "OrganizationRequest_approved_has_org", "OrganizationRequest_rejected_has_reason", "OrganizationRequest_country_iso2", "OrganizationStatusChange_has_subject"]) {
      assert.match(m2, new RegExp(`"${c}"`), c);
    }
  });
  it("no borra ni modifica filas existentes", () => {
    assert.doesNotMatch(m1 + m2, /^\s*(DELETE|TRUNCATE|UPDATE)\b/im);
    assert.doesNotMatch(m1 + m2, /\bDROP (TABLE|COLUMN)\b/i);
  });
});

describe("A3: correcciones de auditoría", () => {
  it("rate limit público de solicitudes: 5 por hora", () => {
    assert.match(read("src/routes/organizationRequests.ts"), /submitLimit = \{ rateLimit: \{ max: 5, timeWindow: "1 hour" \} \}/);
  });
  it("una sola solicitud pendiente por parroquia+correo: índice único parcial en BD", () => {
    assert.match(read("prisma/migrations/20261007000100_organization_lifecycle/migration.sql"),
      /CREATE UNIQUE INDEX "OrganizationRequest_pending_unique"\s+ON "OrganizationRequest"\(lower\("contactEmail"\), lower\("parishName"\)\)\s+WHERE "status" = 'PENDING_REVIEW';/);
  });
  it("redactUrl oculta token= y conserva el resto de la URL", () => {
    assert.equal(redactUrl("/api/organization-requests/status?token=abc123"), "/api/organization-requests/status?token=[REDACTED]");
    assert.equal(redactUrl("/api/registration/info?a=1&token=xyz&b=2"), "/api/registration/info?a=1&token=[REDACTED]&b=2");
    assert.equal(redactUrl("/api/invitations/lookup?TOKEN=xyz"), "/api/invitations/lookup?TOKEN=[REDACTED]");
    assert.equal(redactUrl("/api/events?status=SCHEDULED"), "/api/events?status=SCHEDULED");
  });
  it("app.ts usa el serializer redactado", () => assert.match(read("src/app.ts"), /serializers: \{ req: reqSerializer \}/));
  it("los logs de Fastify no contienen el token", async () => {
    const lines: string[] = [];
    const app = Fastify({ logger: { level: "info", serializers: { req: reqSerializer }, stream: { write: (l: string) => { lines.push(l); } } } });
    app.get("/status", async () => ({ ok: true }));
    const secret = "S3CRETO-token-de-prueba-123456";
    const r = await app.inject({ method: "GET", url: `/status?token=${secret}` });
    await app.close();
    assert.equal(r.statusCode, 200);
    const out = lines.join("");
    assert.ok(out.includes("token=[REDACTED]"), "la URL redactada aparece en el log");
    assert.ok(!out.includes(secret), "el token no aparece en el log");
  });
});
describe("A3: 404 sin tokens en logs", () => {
  it("app.ts reemplaza el 404 por defecto (que registra la URL cruda) por uno con URL redactada", () => {
    assert.match(read("src/app.ts"), /setNotFoundHandler\(\(req, reply\) => \{\s*const url = redactUrl\(req\.url\);/);
  });
});
