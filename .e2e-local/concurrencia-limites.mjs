// D4 — límites de credenciales y códigos con peticiones SIMULTÁNEAS, contra PostgreSQL 18 real (varias conexiones).
// Uso: bash .e2e-local/run-pg.sh concurrencia-limites.mjs api-concurrencia.log
// 1) Control: la misma lógica SIN bloqueo, directamente con Prisma, para demostrar que la prueba detecta la carrera.
// 2) Con el bloqueo de la API (lib/integrationLimits.ts) y por HTTP: nunca se supera el límite.
import { prisma } from "./db.mjs";
import { BASE, check, done, staff } from "./lib.mjs";

const N = 10, LIMIT = 3;
const SEED_PWD = "Peregrinos2026!";
const ADM = "/organization/integrations/sigyp";
const orgA = await prisma.organization.findFirstOrThrow({ where: { name: "Organización Demo" } });
const orgB = await prisma.organization.findFirstOrThrow({ where: { name: "Organización B" } });
const sa = await staff("superadmin@peregrinos.local");
const saUser = await prisma.user.findUniqueOrThrow({ where: { email: "superadmin@peregrinos.local" } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const activeCodes = (org) => prisma.integrationLinkCode.count({ where: { organizationId: org, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
const activeClients = (org) => prisma.integrationClient.count({ where: { organizationId: org, revokedAt: null } });

/** Cuenta y crea en una transacción; `lock` = SELECT … FOR UPDATE de la organización antes de contar. */
async function tryCreate(org, lock) {
  try {
    await prisma.$transaction(async (tx) => {
      if (lock) await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${org} FOR UPDATE`;
      const n = await tx.integrationLinkCode.count({ where: { organizationId: org, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
      await sleep(40); // ensancha la ventana entre contar y crear (como una petición lenta)
      if (n >= LIMIT) throw new Error("LIMIT");
      await tx.integrationLinkCode.create({ data: { organizationId: org, codeHash: rnd(), scopes: ["profile:write"], createdById: saUser.id, expiresAt: new Date(Date.now() + 10 * 60_000) } });
    }, { timeout: 20_000 });
    return true;
  } catch (e) { if (e.message !== "LIMIT") throw e; return false; }
}

console.log("— Control: sin bloqueo (debe superar el límite: si no, la prueba no sería sensible)");
await Promise.all(Array.from({ length: N }, () => tryCreate(orgB.id, false)));
const raced = await activeCodes(orgB.id);
check(`sin bloqueo, ${N} simultáneas superan el límite (${raced} > ${LIMIT}): la prueba detecta la carrera`, raced > LIMIT, raced);
await prisma.integrationLinkCode.updateMany({ where: { organizationId: orgB.id }, data: { revokedAt: new Date() } });

console.log("— Con el bloqueo de la organización");
const okLocked = (await Promise.all(Array.from({ length: N }, () => tryCreate(orgB.id, true)))).filter(Boolean).length;
check(`con FOR UPDATE: exactamente ${LIMIT} creados de ${N}`, okLocked === LIMIT && (await activeCodes(orgB.id)) === LIMIT, { okLocked, db: await activeCodes(orgB.id) });

console.log("— API: códigos de vinculación simultáneos");
const codes = await Promise.all(Array.from({ length: N }, () => sa.post(`${ADM}/link-codes`, { scopes: ["profile:write"], password: SEED_PWD })));
const st = (rs) => rs.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
check(`${N} simultáneos → ${LIMIT}×201 y el resto 409`, st(codes)[201] === LIMIT && st(codes)[409] === N - LIMIT, st(codes));
check(`en la base: ${LIMIT} códigos vigentes`, (await activeCodes(orgA.id)) === LIMIT);

console.log("— API: credenciales directas simultáneas");
const creds = await Promise.all(Array.from({ length: N }, (_, i) => sa.post(ADM, { label: `Credencial ${i}`, scopes: ["profile:write"], password: SEED_PWD })));
check(`${N} simultáneas → ${LIMIT}×201 y el resto 409`, st(creds)[201] === LIMIT && st(creds)[409] === N - LIMIT, st(creds));
check(`en la base: ${LIMIT} credenciales activas`, (await activeClients(orgA.id)) === LIMIT);

console.log("— API: completar vinculaciones simultáneas con cupo para 2");
const issued = creds.filter((r) => r.status === 201).map((r) => r.body.id);
await sa.post(`${ADM}/${issued[0]}/revoke`, {});
await sa.post(`${ADM}/${issued[1]}/revoke`, {});
const valid = codes.filter((r) => r.status === 201).map((r) => r.body);
const comp = await Promise.all(valid.map((c, i) => fetch(`${BASE}/integrations/sigyp/v1/link/complete`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c.code, installation: { parishCode: "PAR-TEST", label: `PC ${i}` } }),
}).then((r) => r.status)));
const ok = comp.filter((s) => s === 201).length;
check("3 vinculaciones simultáneas con cupo para 2 → 2×201 y 1×409", ok === 2 && comp.filter((s) => s === 409).length === 1, comp);
check(`en la base: nunca más de ${LIMIT} credenciales activas`, (await activeClients(orgA.id)) === LIMIT);
const consumed = await prisma.integrationLinkCode.count({ where: { id: { in: valid.map((c) => c.id) }, usedAt: { not: null } } });
check("solo se consumieron los códigos de las vinculaciones que se completaron", consumed === 2, consumed);

await prisma.$disconnect();
done("Concurrencia de límites (D4)");
