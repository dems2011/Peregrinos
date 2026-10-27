// Responde, como lo haría SIGyP (contrato v1 con credencial requests:sync), la última solicitud hecha en el teléfono:
// la recoge por el cursor y publica «Recibida» y luego «Aprobada» con un mensaje para la persona. Servidor local.
import { BASE, staff } from "./lib.mjs";

const sa = await staff("superadmin@peregrinos.local");
const token = (await sa.post("/organization/integrations/sigyp", { label: "SIGyP de prueba (estado)", scopes: ["requests:sync"], password: "Peregrinos2026!" })).body.token;
const sig = async (method, url, body) => {
  const r = await fetch(`${BASE}/integrations/sigyp/v1${url}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const inc = await sig("GET", "/requests/incoming?after=0");
const last = inc.body.items.at(-1);
if (!last) throw new Error("No hay solicitudes");
console.log(`recibida por cursor: seq=${last.seq} trámite=${last.typeName} solicitante=${last.requesterName}`);
const put = (version, status, message) => sig("PUT", `/requests/${last.sourceId}/status`, { contract: 1, sourceId: last.sourceId, version, status, number: "DEMO-SO-000001", message });
console.log("RECEIVED", (await put(1, "RECEIVED", null)).body);
console.log("APPROVED", (await put(2, "APPROVED", "Te esperamos el sábado 14 a las 11 con la partida.")).body);
console.log("repetir v2 (no duplica)", (await put(2, "APPROVED", "otra")).body);
