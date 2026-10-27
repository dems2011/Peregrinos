// Datos SINTÉTICOS para probar la app en un teléfono contra el servidor local (dispositivo.sh): dos turnos pendientes
// para el titular (SIGyP simulado con su credencial real de integración), un trámite habilitado en línea y un fiel con
// su cuenta verificada que sigue la parroquia. Nada de esto toca producción.
import { randomUUID } from "node:crypto";
import { prisma } from "./db.mjs";
import { BASE, client, mailLink, staff, tokenFrom } from "./lib.mjs";

const SEED_PWD = "Peregrinos2026!";
const V1 = `${BASE}/integrations/sigyp/v1`;
const sig = async (method, url, token, body) => {
  const res = await fetch(V1 + url, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const orgA = await prisma.organization.findFirstOrThrow({ where: { name: "Organización Demo" } });
const sa = await staff("superadmin@peregrinos.local");
const token = (await sa.post("/organization/integrations/sigyp", { label: "SIGyP de prueba (teléfono)", scopes: ["turns:write", "requests:sync"], password: SEED_PWD })).body.token;
const day = (d, h) => { const x = new Date(Date.now() + d * 86_400_000); x.setUTCHours(h, 0, 0, 0); return x.toISOString(); };
for (const [title, d] of [["Confesión (prueba en teléfono)", 3], ["Bendición de hogar (prueba en teléfono)", 4]]) {
  const t = { contract: 1, sourceId: randomUUID(), version: 1, title, category: "Turno", startsAt: day(d, 14), endsAt: day(d, 15), location: "Despacho parroquial", note: null, status: "PENDING" };
  const r = await sig("PUT", `/turns/${t.sourceId}`, token, t);
  if (r.body?.status !== "applied") throw new Error(`turno: ${JSON.stringify(r.body)}`);
}
const typeId = randomUUID();
await sig("PUT", `/request-types/${typeId}`, token, { contract: 1, sourceId: typeId, version: 1, name: "Bautismo", description: "Traer la partida de nacimiento.", status: "ACTIVE" });
const email = "fiel.telefono@test.local", pwd = "una-clave-segura-1";
const c = client();
await c.post("/auth/register-pilgrim", { firstName: "Fiel", lastName: "Teléfono", email, documentNumber: "30999001", phone: "1155550000", password: pwd, acceptTerms: true });
const link = await mailLink(email, "verificar-email?token=");
await c.get(`/auth/verify-email?token=${encodeURIComponent(tokenFrom(link))}`);
await c.post("/auth/account/login", { email, password: pwd });
await c.post("/auth/account/follows", { organizationId: orgA.id });
console.log(`DATOS_OK organización=${orgA.id} turnos=2 trámite=${typeId}`);
await prisma.$disconnect();
