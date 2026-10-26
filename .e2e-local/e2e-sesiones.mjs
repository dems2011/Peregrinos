// E2E A5.2 — cierre de sesiones del peregrino y reemplazo de la sesión de /p, contra la API y una base local.
// Uso: bash .e2e-local/run.sh e2e-sesiones.mjs api-sesiones.log
import { createHash } from "node:crypto";
import { prisma } from "./db.mjs";
import { check, client, done, mailLink, tokenFrom } from "./lib.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
const setCookies = (r) => r.headers.getSetCookie().join("\n");
const cleared = (r, name) => new RegExp(`${name}=;[^\\n]*(Expires=Thu, 01 Jan 1970|Max-Age=0)`, "i").test(setCookies(r));

// Participante del seed con un código de acceso conocido (dato sintético).
const part = await prisma.participant.findFirstOrThrow({ where: { status: "ACTIVE" }, orderBy: { number: "asc" } });
const CODE = "E2ESES0001";
await prisma.participant.update({ where: { id: part.id }, data: { accessCodeHash: sha(CODE) } });

// Cuenta de peregrino real (registro, verificación por correo y login por la API).
const PWD = "una-clave-segura-1";
const email = "sesiones@test.local";
const A = client();
check("registro de la cuenta", (await A.post("/auth/register-pilgrim", { firstName: "Ses", lastName: "Prueba", email, documentNumber: "30999001", phone: "1155554444", password: PWD, acceptTerms: true })).status === 202);
await A.get(`/auth/verify-email?token=${encodeURIComponent(tokenFrom(await mailLink(email, "verificar-email?token=")))}`);
check("login de la cuenta", (await A.post("/auth/account/login", { email, password: PWD })).status === 200);
const login = async (c, code = CODE) => c.post("/pilgrim/login", { code });

console.log("— Cierre completo (cuenta + evento) desde un navegador");
check("A entra a /p con su código", (await login(A)).status === 200);
const pgPa = A.jar.get("pg_pa"), pgPt = A.jar.get("pg_pt");
check("A tiene las dos cookies", !!pgPa && !!pgPt);
const B = client();
check("B (otro dispositivo) entra a /p con el mismo código", (await login(B)).status === 200);
const user0 = await prisma.user.findUniqueOrThrow({ where: { email } });
const r1 = await A.post("/pilgrim/logout-browser");
check("logout-browser: 200 y cierra las dos sesiones", r1.status === 200 && r1.body?.accountClosed === true && r1.body?.eventRevoked === true, r1.body);
check("borra pg_pa y pg_pt", cleared(r1, "pg_pa") && cleared(r1, "pg_pt"), setCookies(r1));
check("Cache-Control: no-store", /no-store/.test(r1.headers.get("cache-control") ?? ""));
check("sessionVersion +1 en la base", (await prisma.user.findUniqueOrThrow({ where: { email } })).sessionVersion === user0.sessionVersion + 1);
check("sesión de evento de A revocada", !!(await prisma.pilgrimSession.findUnique({ where: { tokenHash: sha(pgPt) } }))?.revokedAt);
check("auditoría LOGOUT de la cuenta", (await prisma.auditLog.count({ where: { action: "LOGOUT", entityId: user0.id } })) === 1);
// Copias de las cookies (alguien que las hubiera guardado) ya no sirven.
const copy = client(); copy.jar.set("pg_pa", pgPa); copy.jar.set("pg_pt", pgPt);
check("copia de pg_pa → 401 en /auth/account/me", (await copy.get("/auth/account/me")).status === 401);
check("copia de pg_pt → 401 en /pilgrim/me", (await copy.get("/pilgrim/me")).status === 401);
check("B (otro dispositivo) sigue con su sesión de /p", (await B.get("/pilgrim/me")).status === 200);

console.log("— Repetición");
const r2 = await copy.post("/pilgrim/logout-browser");
check("repetir con las cookies viejas: 200, nada que cerrar, cookies borradas", r2.status === 200 && r2.body?.accountClosed === false && r2.body?.eventRevoked === false && cleared(r2, "pg_pa"), r2.body);
check("repetir no vuelve a incrementar sessionVersion", (await prisma.user.findUniqueOrThrow({ where: { email } })).sessionVersion === user0.sessionVersion + 1);
check("repetir no duplica la auditoría", (await prisma.auditLog.count({ where: { action: "LOGOUT", entityId: user0.id } })) === 1);
const empty = await client().post("/pilgrim/logout-browser");
check("sin cookies: 200 y nada cerrado", empty.status === 200 && empty.body?.accountClosed === false && empty.body?.eventRevoked === false);
const noCsrf = await fetch("http://127.0.0.1:4555/api/pilgrim/logout-browser", { method: "POST", headers: { cookie: `pg_pt=${B.jar.get("pg_pt")}` } });
check("sin el encabezado CSRF: 403 y la sesión de B sigue vigente", noCsrf.status === 403 && (await B.get("/pilgrim/me")).status === 200, noCsrf.status);

console.log("— Reemplazo de la sesión de /p en el mismo navegador");
const C = client();
await login(C);
const s1 = C.jar.get("pg_pt");
check("C entra de nuevo: 200", (await login(C)).status === 200);
const s2 = C.jar.get("pg_pt");
check("la cookie cambió", s1 && s2 && s1 !== s2);
check("la sesión reemplazada quedó revocada", !!(await prisma.pilgrimSession.findUnique({ where: { tokenHash: sha(s1) } }))?.revokedAt);
check("la nueva está vigente", (await C.get("/pilgrim/me")).status === 200);
check("B no se vio afectado", (await B.get("/pilgrim/me")).status === 200);
const bad = await login(C, "ZZZZZZZZZZ");
check("código inválido: 401 y NO revoca la sesión vigente del navegador", bad.status === 401 && (await C.get("/pilgrim/me")).status === 200 && !(await prisma.pilgrimSession.findUnique({ where: { tokenHash: sha(s2) } }))?.revokedAt);
const foreign = client(); foreign.jar.set("pg_pt", "token-que-no-existe");
check("token desconocido en la cookie: entra igual y no revoca nada ajeno", (await login(foreign)).status === 200 && (await B.get("/pilgrim/me")).status === 200);

console.log("— Falla de la base durante el cierre (sin estados parciales)");
// Falla real de PostgreSQL: un trigger (solo en esta base local) rechaza la revocación de la sesión de E.
const E = client();
await E.post("/auth/account/login", { email, password: PWD });
await login(E);
const ePt = E.jar.get("pg_pt");
const sv0 = (await prisma.user.findUniqueOrThrow({ where: { email } })).sessionVersion;
await prisma.$executeRawUnsafe(`CREATE FUNCTION e2e_fail() RETURNS trigger AS $$ BEGIN IF NEW."tokenHash" = '${sha(ePt)}' THEN RAISE EXCEPTION 'falla simulada'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
await prisma.$executeRawUnsafe(`CREATE TRIGGER e2e_fail BEFORE UPDATE ON "PilgrimSession" FOR EACH ROW EXECUTE FUNCTION e2e_fail()`);
const rf = await E.post("/pilgrim/logout-browser");
check("la API responde error (5xx)", rf.status >= 500, rf.status);
check("no borra ninguna cookie si la base no confirmó", !/pg_pa=;|pg_pt=;/.test(setCookies(rf)), setCookies(rf));
check("la cuenta NO se cerró a medias (sessionVersion sin cambios: se revirtió)", (await prisma.user.findUniqueOrThrow({ where: { email } })).sessionVersion === sv0);
check("la sesión de evento sigue vigente", (await E.get("/pilgrim/me")).status === 200 && (await E.get("/auth/account/me")).status === 200);
await prisma.$executeRawUnsafe(`DROP TRIGGER e2e_fail ON "PilgrimSession"`);
await prisma.$executeRawUnsafe(`DROP FUNCTION e2e_fail()`);
const rr = await E.post("/pilgrim/logout-browser");
check("reintento después de la falla: cierra las dos", rr.status === 200 && rr.body?.accountClosed === true && rr.body?.eventRevoked === true, rr.body);

console.log("— Salir de este dispositivo (/p) y cierre solo de la cuenta");
const r3 = await B.post("/pilgrim/logout");
check("B: /pilgrim/logout 204, cookie borrada, su sesión revocada", r3.status === 204 && cleared(r3, "pg_pt"));
check("C sigue vigente después de que B salió", (await C.get("/pilgrim/me")).status === 200);
const D = client();
await D.post("/auth/account/login", { email, password: PWD });
const r4 = await D.post("/auth/account/logout");
check("/auth/account/logout: 204, borra pg_pa y NO toca pg_pt", r4.status === 204 && cleared(r4, "pg_pa") && !/pg_pt=/.test(setCookies(r4)));

await prisma.$disconnect();
done("E2E sesiones del peregrino");
