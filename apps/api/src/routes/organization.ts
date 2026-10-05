import type { FastifyInstance } from "fastify";
import { submitOrganizationReviewSchema } from "@peregrinos/shared";
import { prisma } from "../lib/prisma";
import { audit } from "../lib/audit";
import { AppError, forbidden } from "../lib/errors";
import { assertOrgCan, assertOrgTransition } from "../lib/orgLifecycle";
import { recordStatusChange } from "../lib/orgStatus";

/** A3 — Estado de la propia organización para su personal, y presentación a revisión por su SUPERADMIN. */
export default async function organizationRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async (req) => {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth.organizationId },
      select: {
        id: true, name: true, status: true,
        statusChanges: { orderBy: { createdAt: "desc" }, take: 1, select: { fromStatus: true, toStatus: true, reason: true, createdAt: true } },
      },
    });
    const { statusChanges, ...rest } = org;
    return { organization: { ...rest, lastChange: statusChanges[0] ?? null } };
  });

  /** DRAFT/REJECTED → PENDING_REVIEW. Solo el SUPERADMIN de la parroquia. */
  app.post("/submit-review", { preHandler: app.authenticate }, async (req) => {
    if (req.auth.role !== "SUPERADMIN") throw forbidden();
    const { note } = submitOrganizationReviewSchema.parse(req.body ?? {});
    const from = req.auth.organizationStatus;
    assertOrgCan(from, "SUBMIT_REVIEW");
    assertOrgTransition(from, "PENDING_REVIEW", "ORG_SUPERADMIN", note);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.organization.updateMany({ where: { id: req.auth.organizationId, status: from }, data: { status: "PENDING_REVIEW" } });
      if (claimed.count !== 1) throw new AppError(409, "STATUS_CHANGED", "El estado de la organización cambió. Vuelve a consultarla.");
      await recordStatusChange(tx, {
        organizationId: req.auth.organizationId, fromStatus: from, toStatus: "PENDING_REVIEW",
        actor: { id: req.auth.id, accountType: "STAFF" }, reason: note ?? "Presentada a revisión",
      });
    });
    await audit(req, { action: "ORGANIZATION_SUBMITTED_FOR_REVIEW", entityType: "Organization", entityId: req.auth.organizationId, metadata: { from } });
    return { status: "PENDING_REVIEW" };
  });
}
