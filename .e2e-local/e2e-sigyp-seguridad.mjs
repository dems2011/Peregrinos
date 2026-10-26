// E2E S6 — seguridad de la integración SIGyP (D1–D4) contra la API y una base local en memoria. SIGyP se simula con
// llamadas HTTP con su credencial (Bearer, sin cookies), igual que su cliente real.
// Uso: bash .e2e-local/run.sh e2e-sigyp-seguridad.mjs api-sigyp-seguridad.log
import { createRequire } from "node:module";
import { prisma } from "./db.mjs";
import { BASE, check, client, done, staff } from "./lib.mjs";

const SEED_PWD = "Peregrinos2026!";
const V1 = `${BASE}/integrations/sigyp/v1`;
const sig = async (method, url, token, body) => {
  const res = await fetch(V1 + url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  let json = null; try { json = t ? JSON.parse(t) : null; } catch { json = t; }
  return { status: res.status, body: json };
};
const ADM = "/organization/integrations/sigyp";
const BASE_SCOPES = ["announcements:write", "profile:write", "events:write", "notices:send"];
const orgA = await prisma.organization.findFirstOrThrow({ where: { name: "Organización Demo" } });
const auditCount = (action, extra = {}) => prisma.auditLog.count({ where: { action, organizationId: orgA.id, ...extra } });

const sa = await staff("superadmin@peregrinos.local");
const admin = await staff("admin@peregrinos.local");
const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@peregrinos.local" } });

console.log("— D1: reautenticación con contraseña");
check("código sin contraseña: 400", (await sa.post(`${ADM}/link-codes`, { scopes: BASE_SCOPES })).status === 400);
const wrong = await sa.post(`${ADM}/link-codes`, { scopes: BASE_SCOPES, password: "no-es-la-clave" });
check("contraseña incorrecta: 403 REAUTH_FAILED", wrong.status === 403 && wrong.body?.error === "REAUTH_FAILED", wrong.body);
const fails = await prisma.auditLog.findMany({ where: { action: "REAUTH_FAILED" } });
check("el fallo queda auditado con el propósito y SIN la contraseña", fails.length === 1 && fails[0].metadata?.purpose === "sigyp:link-code:create" && !JSON.stringify(fails).includes("no-es-la-clave"), fails.map((f) => f.metadata));
check("contraseña incorrecta: no se creó ningún código", (await prisma.integrationLinkCode.count({ where: { organizationId: orgA.id } })) === 0);
// Otra cuenta con OTRA contraseña: la verificación es contra la cuenta autenticada, nunca contra otra.
const argon2 = createRequire(new URL("../apps/api/package.json", import.meta.url))("argon2");
await prisma.user.update({ where: { email: "superadmin.b@peregrinos.local" }, data: { passwordHash: await argon2.hash("clave-propia-de-b-123") } });
const saB = await staff("superadmin.b@peregrinos.local", "clave-propia-de-b-123");
check("SUPERADMIN de B con la contraseña de A: 403 (se verifica contra la propia cuenta)", (await saB.post(`${ADM}/link-codes`, { scopes: BASE_SCOPES, password: SEED_PWD })).status === 403);
check("SUPERADMIN de B con su propia contraseña: 201 (en SU organización)", (await saB.post(`${ADM}/link-codes`, { scopes: ["profile:write"], password: "clave-propia-de-b-123" })).status === 201);

console.log("— D2: solo el SUPERADMIN concede, con alcances explícitos");
// El titular concede parish:profile al ADMIN por la API (pantalla de permisos).
check("el titular concede parish:profile y notice:send al ADMIN", (await sa.req("PUT", `/users/${adminUser.id}/permissions`, { extraPermissions: ["parish:profile", "notice:send"] })).status === 200);
const adminRelogin = await staff("admin@peregrinos.local");
const d1 = await adminRelogin.post(ADM, { label: "SIGyP", scopes: BASE_SCOPES, password: SEED_PWD });
check("ADMIN con parish:profile y contraseña correcta NO crea credenciales: 403", d1.status === 403, d1.body);
check("ADMIN tampoco genera códigos: 403", (await adminRelogin.post(`${ADM}/link-codes`, { scopes: BASE_SCOPES, password: SEED_PWD })).status === 403);
check("los intentos quedan auditados (SIGYP_GRANT_DENIED)", (await auditCount("SIGYP_GRANT_DENIED")) === 2);
check("ADMIN sí puede ver la integración", (await adminRelogin.get(ADM)).status === 200);
check("sin alcances: 400", (await sa.post(ADM, { label: "SIGyP", scopes: [], password: SEED_PWD })).status === 400);
check("alcance inexistente: 400", (await sa.post(ADM, { label: "SIGyP", scopes: ["admin:all"], password: SEED_PWD })).status === 400);
const direct = await sa.post(ADM, { label: "Solo cartelera", scopes: ["announcements:write"], password: SEED_PWD });
check("SUPERADMIN: credencial directa con UN alcance: 201", direct.status === 201 && JSON.stringify(direct.body?.scopes) === '["announcements:write"]', direct.body);
const tokAnn = direct.body?.token;
check("Cache-Control: no-store al entregar la credencial", /no-store/.test(direct.headers.get("cache-control") ?? ""));
const stored = await prisma.integrationClient.findFirstOrThrow({ where: { organizationId: orgA.id, label: "Solo cartelera" } });
check("en la base solo el hash (nunca el secreto) y los alcances elegidos", stored.tokenHash !== tokAnn && !JSON.stringify(stored).includes(tokAnn) && stored.scopes.length === 1);
check("auditoría SIGYP_CLIENT_CREATED sin el secreto", (await prisma.auditLog.findMany({ where: { action: "SIGYP_CLIENT_CREATED" } })).every((a) => !JSON.stringify(a).includes(tokAnn)));
const annBody = (id, version) => ({ contract: 1, sourceId: id, version, title: "Misa de prueba", body: "Domingo 10 h", category: "LITURGIA", startsAt: "2026-10-18T10:00:00.000Z", endsAt: null, publishedAt: "2026-10-17T09:00:00.000Z" });
const annId = crypto.randomUUID();
check("con announcements:write publica la cartelera", (await sig("PUT", `/announcements/${annId}`, tokAnn, annBody(annId, 1))).body?.status === "applied");
const profile = { contract: 1, version: 1, profile: { description: "Perfil", address: null, phone: null, email: null, website: null, instagram: null, facebook: null, youtube: null, officeHours: null } };
check("sin profile:write NO cambia el perfil: 403", (await sig("PUT", "/profile", tokAnn, profile)).status === 403);
check("sin notices NO consulta los grupos: 403", (await sig("GET", "/notices/audiences", tokAnn)).status === 403);

// Vinculación con código: la credencial recibe EXACTAMENTE los alcances del código.
const lc = await sa.post(`${ADM}/link-codes`, { scopes: ["profile:write", "notices:send"], password: SEED_PWD });
check("código con dos alcances: 201", lc.status === 201 && lc.body?.scopes?.length === 2, lc.body);
const prev = await sig("POST", "/link/preview", null, { code: lc.body.code });
check("vista previa: muestra exactamente lo que se compartirá", prev.status === 200 && prev.body?.scopes?.length === 2 && prev.body.shares.length === 2, prev.body);
const comp = await sig("POST", "/link/complete", null, { code: lc.body.code, installation: { parishCode: "PAR-TEST", label: "Secretaría" } });
check("completar entrega una credencial con esos dos alcances", comp.status === 201 && JSON.stringify(comp.body?.scopes) === '["profile:write","notices:send"]', comp.body);
const tokLink = comp.body?.token;
check("y no puede publicar cartelera (no la concedieron)", (await sig("PUT", `/announcements/${crypto.randomUUID()}`, tokLink, annBody(crypto.randomUUID(), 1))).status === 403);

console.log("— D3: avisos al personal con un permiso propio");
const aud = await sig("GET", "/notices/audiences", tokLink);
check("notices:send: solo seguidores en los grupos y en los recuentos", aud.status === 200 && JSON.stringify(aud.body?.allowed) === '["FOLLOWERS"]' && Object.keys(aud.body?.counts ?? {}).every((k) => k === "FOLLOWERS"), aud.body);
const notice = (audiences) => ({ contract: 1, sourceId: crypto.randomUUID(), title: "Reunión", body: "Mañana 19 h", audiences, delivery: "INBOX" });
const nStaff = notice(["STAFF:ADMIN"]);
const ds = await sig("POST", `/notices/${nStaff.sourceId}`, tokLink, nStaff);
check("notices:send → aviso al personal: 403 AUDIENCE_NOT_ALLOWED", ds.status === 403 && ds.body?.error === "AUDIENCE_NOT_ALLOWED", ds.body);
check("no se creó el aviso", (await prisma.notification.count({ where: { sourceSystem: "SIGYP", sourceId: nStaff.sourceId } })) === 0);
const denied = await prisma.auditLog.findFirst({ where: { action: "SIGYP_NOTICE_DENIED" } });
check("rechazo auditado con actor (credencial), alcance y grupos denegados", denied?.metadata?.clientId && JSON.stringify(denied.metadata.denied) === '["STAFF:ADMIN"]' && Array.isArray(denied.metadata.scopes), denied?.metadata);
const nF = notice(["FOLLOWERS"]);
check("notices:send → seguidores: se aplica", (await sig("POST", `/notices/${nF.sourceId}`, tokLink, nF)).body?.status === "applied");
const staffCred = await sa.post(ADM, { label: "Personal", scopes: ["notices:staff"], password: SEED_PWD });
const tokStaff = staffCred.body?.token;
const nS2 = notice(["STAFF:ADMIN"]);
const okStaff = await sig("POST", `/notices/${nS2.sourceId}`, tokStaff, nS2);
check("notices:staff concedido por el titular → aviso al personal: se aplica y le llega al ADMIN", okStaff.body?.status === "applied" && okStaff.body?.recipientCount >= 1, okStaff.body);
const sent = await prisma.auditLog.findFirst({ where: { action: "SIGYP_NOTICE_SENT", metadata: { path: ["sourceId"], equals: nS2.sourceId } } });
check("envío auditado con la credencial y el resultado", sent?.metadata?.clientId === staffCred.body.id && typeof sent.metadata.recipients === "number", sent?.metadata);
// Panel: notice:send sin notice:staff no alcanza para el personal.
const pa = await adminRelogin.get("/organization/notifications/audiences");
check("panel: ADMIN con notice:send ve solo seguidores", pa.status === 200 && JSON.stringify(pa.body?.allowed) === '["FOLLOWERS"]', pa.body);
const pm = await adminRelogin.post("/organization/notifications/multi", { title: "Reunión", body: "Mañana 19 h", audiences: ["STAFF:OPERATOR"], delivery: "INBOX", confirmedRecipients: 1 });
check("panel: aviso al personal sin notice:staff → 403 y auditado", pm.status === 403 && pm.body?.error === "AUDIENCE_NOT_ALLOWED" && (await auditCount("NOTIFICATION_DENIED")) === 1, pm.body);
check("el titular concede notice:staff", (await sa.req("PUT", `/users/${adminUser.id}/permissions`, { extraPermissions: ["parish:profile", "notice:send", "notice:staff"] })).status === 200);
const admin3 = await staff("admin@peregrinos.local");
const pa2 = await admin3.get("/organization/notifications/audiences");
check("con notice:staff el ADMIN ve también los grupos del personal", pa2.body?.allowed?.includes("STAFF:OPERATOR"), pa2.body);

console.log("— D4: límites (secuenciales; la concurrencia se prueba en PostgreSQL real)");
const activeCodes = await prisma.integrationLinkCode.count({ where: { organizationId: orgA.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
for (let i = activeCodes; i < 3; i++) await sa.post(`${ADM}/link-codes`, { scopes: ["profile:write"], password: SEED_PWD });
const c4 = await sa.post(`${ADM}/link-codes`, { scopes: ["profile:write"], password: SEED_PWD });
check("cuarto código vigente: 409 TOO_MANY_LINK_CODES", c4.status === 409 && c4.body?.error === "TOO_MANY_LINK_CODES", c4.body);
const activeClients = await prisma.integrationClient.count({ where: { organizationId: orgA.id, revokedAt: null } });
check("hay 3 credenciales activas (cartelera, vinculada, personal)", activeClients === 3, activeClients);
check("cuarta credencial directa: 409 TOO_MANY_CLIENTS", (await sa.post(ADM, { label: "Otra", scopes: ["profile:write"], password: SEED_PWD })).body?.error === "TOO_MANY_CLIENTS");
const spare = await prisma.integrationLinkCode.findFirstOrThrow({ where: { organizationId: orgA.id, usedAt: null, revokedAt: null } });
// El código en claro solo existe en la respuesta: se genera uno nuevo revocando uno vigente para tener cupo.
await sa.post(`${ADM}/link-codes/${spare.id}/revoke`, {});
const lc2 = await sa.post(`${ADM}/link-codes`, { scopes: ["profile:write"], password: SEED_PWD });
const full = await sig("POST", "/link/complete", null, { code: lc2.body.code, installation: { parishCode: "PAR-TEST", label: "Otra PC" } });
check("completar con 3 credenciales activas: 409 y el código NO se consume", full.status === 409 && full.body?.error === "TOO_MANY_CLIENTS" && !(await prisma.integrationLinkCode.findUniqueOrThrow({ where: { id: lc2.body.id } })).usedAt, full.body);

console.log("— Revocación");
check("revocar la credencial de cartelera (sin contraseña): 200", (await sa.post(`${ADM}/${stored.id}/revoke`, {})).status === 200);
check("la credencial revocada deja de servir de inmediato: 401", (await sig("GET", "/whoami", tokAnn)).status === 401);
check("con cupo libre, completar ahora funciona", (await sig("POST", "/link/complete", null, { code: lc2.body.code, installation: { parishCode: "PAR-TEST", label: "Otra PC" } })).status === 201);
check("ADMIN con parish:profile puede revocar (solo quita acceso)", (await admin3.post(`${ADM}/${staffCred.body.id}/revoke`, {})).status === 200);

console.log("— D1: liberar el perfil");
check("SIGyP toma el perfil", (await sig("PUT", "/profile", tokLink, profile)).body?.status === "applied");
check("liberar sin contraseña: 400", (await sa.post(`${ADM}/release-profile`, {})).status === 400);
check("liberar con contraseña incorrecta: 403", (await sa.post(`${ADM}/release-profile`, { password: "otra" })).status === 403);
check("liberar con contraseña correcta: 200", (await sa.post(`${ADM}/release-profile`, { password: SEED_PWD })).status === 200);
check("ningún registro de auditoría contiene la contraseña", !(await prisma.auditLog.findMany()).some((a) => JSON.stringify(a.metadata ?? {}).includes(SEED_PWD)));

await prisma.$disconnect();
done("E2E seguridad SIGyP (D1–D4)");
