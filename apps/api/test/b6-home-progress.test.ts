/**
 * Pantalla principal del peregrino — avance del recorrido en la cuenta (GET /api/auth/account/progress). Tests sin base de datos.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const social = read("src/routes/accountSocial.ts");
const handler = social.slice(social.indexOf('app.get("/progress"'), social.indexOf("/* ---------- Chat del evento"));
const lib = read("src/lib/routeProgress.ts");
const pilgrim = read("src/routes/pilgrim.ts");

describe("Avance: una sola regla para el acceso personal y la cuenta", () => {
  it("solo puntos de control ACTIVOS, en orden, y llegadas ACTIVAS del propio participante", () => {
    assert.match(lib, /checkpoint\.findMany\(\{ where: \{ eventId, status: "ACTIVE" \}, orderBy: \{ order: "asc" \} \}\)/);
    assert.match(lib, /checkin\.findMany\(\{ where: \{ eventId, participantId, status: "ACTIVE" \} \}\)/);
  });
  it("porcentaje solo con puntos; sin puntos es 0 y total 0 (la pantalla muestra estado vacío)", () => {
    assert.match(lib, /percent: route\.length \? Math\.round\(\(done \/ route\.length\) \* 100\) : 0/);
  });
  it("solo lectura: no crea, modifica ni borra registros", () => {
    assert.doesNotMatch(lib, /\.(create|update|upsert|delete)(Many)?\(/);
    assert.doesNotMatch(handler, /\.(create|update|upsert|delete)(Many)?\(/);
  });
  it("el acceso personal (/pilgrim/me) usa la misma función", () => {
    assert.match(pilgrim, /participantRoute\(p\.eventId, participantId\)/);
    assert.doesNotMatch(pilgrim, /checkin\.findMany/);
  });
});

describe("GET /auth/account/progress", () => {
  it("exige la sesión de la cuenta del peregrino", () => {
    assert.match(handler, /app\.get\("\/progress", auth,/);
  });
  it("solo participaciones ACTIVAS de la propia Person, en eventos no borrador ni cancelados", () => {
    assert.match(handler, /where: \{ id: req\.pilgrimAccount\.id \}, select: \{ personId: true \}/);
    assert.match(handler, /where: \{ personId: u\.personId, status: "ACTIVE", event: \{ status: \{ in: \["IN_PROGRESS", "SCHEDULED", "FINISHED"\] \} \} \}/);
  });
  it("sin Person o sin participación → { current: null } (nada inventado)", () => {
    assert.equal(handler.match(/return \{ current: null \};/g)?.length, 2);
  });
  it("prioridad: evento en curso, luego el próximo programado, luego el último terminado", () => {
    assert.match(handler, /const rank = \{ IN_PROGRESS: 0, SCHEDULED: 1, FINISHED: 2 \}/);
  });
  it("no expone el token del QR ni datos de otras personas", () => {
    assert.doesNotMatch(handler, /qrToken|documentNumber/);
  });
});

describe("Pantalla contextual: herramientas según las capacidades del evento (no su tipo)", () => {
  it("cada herramienta sale de una capacidad del evento", () => {
    assert.match(handler, /const tools = \{ points: has\("POINTS"\), checkin: has\("CHECKIN"\), journey: has\("ROUTE"\) && !!e\.route, location: has\("LOCATION"\), contacts: has\("CONTACTS"\) \}/);
    assert.doesNotMatch(handler, /e\.type ===|type: \{ in:/);
  });
  it("sin POINTS no se consultan puntos ni llegadas (sin avance inventado)", () => {
    assert.match(handler, /const points = tools\.points \? await participantRoute\(e\.id, p\.id\) : \{ route: \[\], progress: \{ done: 0, total: 0, percent: 0 \} \}/);
  });
  it("lugar, trayecto y contactos solo con su capacidad", () => {
    assert.match(handler, /place: tools\.location && \(e\.locationName \|\| e\.address\) \?/);
    assert.match(handler, /journey: tools\.journey && e\.route \?/);
    assert.match(handler, /contacts: tools\.contacts \? await eventContacts\(e\.id\) : \[\]/);
  });
  it("todo lo devuelto es del mismo evento elegido (sin mezclar participaciones)", () => {
    assert.match(handler, /participantRoute\(e\.id, p\.id\)/);
    assert.match(handler, /eventContacts\(e\.id\)/);
  });
  it("los contactos son los mismos que en el acceso personal", () => {
    assert.match(pilgrim, /const contactsOf = eventContacts;/);
    assert.match(lib, /export async function eventContacts\(eventId: string\)/);
  });
});
