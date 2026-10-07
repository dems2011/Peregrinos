/**
 * Push — endpoints de dispositivos (tokens FCM) de la cuenta del peregrino. Tests sin base de datos.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const social = read("src/routes/accountSocial.ts");
const post = social.slice(social.indexOf('app.post("/devices"'), social.indexOf('app.delete("/devices"'));
const del = social.slice(social.indexOf('app.delete("/devices"'), social.indexOf("/* ---------- Mis eventos"));

describe("Push: registro de dispositivo", () => {
  it("exige la sesión de la cuenta del peregrino y tiene límite de frecuencia", () => {
    assert.match(post, /app\.post\("\/devices", limited\(30\)/);
    assert.match(social, /const limited = \(max: number\) => \(\{ preHandler: app\.authenticatePilgrimAccount/);
  });
  it("cuerpo estricto: token con formato FCM y plataforma ANDROID", () => {
    assert.match(social, /const deviceBody = z\.object\(\{ token: fcmToken, platform: z\.enum\(\["ANDROID"\]\)\.default\("ANDROID"\) \}\)\.strict\(\)/);
    assert.match(social, /regex\(\/\^\[A-Za-z0-9_:-\]\+\$\//);
  });
  it("token único: upsert que lo reasigna a la cuenta, renueva lastSeenAt y limpia revokedAt", () => {
    assert.match(post, /upsert\(\{\s*where: \{ token \}/);
    assert.match(post, /update: \{ userId, platform, lastSeenAt: new Date\(\), revokedAt: null \}/);
  });
  it("la respuesta y la auditoría nunca incluyen el token", () => {
    assert.match(post, /select: \{ id: true, platform: true, lastSeenAt: true \}/);
    assert.doesNotMatch(post.slice(post.indexOf("await audit(")), /metadata: \{[^}]*token/);
  });
});

describe("Push: baja de dispositivo", () => {
  it("DELETE /devices con sesión de la cuenta y límite de frecuencia", () => {
    assert.match(del, /app\.delete\("\/devices", limited\(30\)/);
  });
  it("el token va en un cuerpo estricto, nunca en la URL (las URL quedan en los logs)", () => {
    assert.match(social, /const deviceRevokeBody = z\.object\(\{ token: fcmToken \}\)\.strict\(\)/);
    assert.match(del, /deviceRevokeBody\.parse\(req\.body\)/);
    assert.doesNotMatch(social, /"\/devices\/:/);
    assert.doesNotMatch(del, /req\.(params|query)/);
  });
  it("solo revoca tokens de la propia cuenta y no borra la fila", () => {
    assert.match(del, /updateMany\(\{ where: \{ token, userId: req\.pilgrimAccount\.id, revokedAt: null \}, data: \{ revokedAt: new Date\(\) \} \}\)/);
    assert.doesNotMatch(del, /deviceToken\.delete/);
  });
  it("la respuesta no incluye el token", () => {
    assert.match(del, /return \{ revoked: r\.count > 0 \};/);
  });
});

describe("Push: envío de avisos a los seguidores", () => {
  const notif = read("src/lib/notifications.ts");
  const push = notif.slice(notif.indexOf("export async function pushNotification"), notif.indexOf("/** Estados en los que"));
  const follow = notif.slice(notif.indexOf("export async function notifyFollowers"), notif.indexOf("/** FCM admite"));
  const events = read("src/routes/events.ts");
  const org = read("src/routes/organization.ts");

  it("notifyFollowers no cambia: sigue sin enviar push (solo la bandeja, dentro de la transacción)", () => {
    assert.doesNotMatch(follow, /push|sendPush/i);
    assert.match(follow, /notificationRecipient\.createMany/);
  });
  it("sin Firebase configurado no hace nada; nunca lanza", () => {
    assert.match(push, /if \(!pushConfigured\(\)\) return;/);
    assert.match(push, /\} catch \(e\) \{\s*console\.error\(/);
  });
  it("destinatarios del aviso guardado y solo tokens activos (revokedAt IS NULL)", () => {
    assert.match(push, /notificationRecipient\.findMany\(\{ where: \{ notificationId: n\.id \}/);
    assert.match(push, /deviceToken\.findMany\(\{ where: \{ userId: \{ in: userIds \}, revokedAt: null \}/);
  });
  it("datos para abrir el aviso en la app: notificationId, organizationId y eventId si existe", () => {
    assert.match(push, /const data: Record<string, string> = \{ notificationId: n\.id, organizationId: n\.organizationId \}/);
    assert.match(push, /if \(n\.eventId\) data\.eventId = n\.eventId;/);
  });
  it("los tokens que FCM rechaza quedan dados de baja (revokedAt), sin borrar", () => {
    assert.match(push, /deviceToken\.updateMany\(\{ where: \{ token: \{ in: result\.invalid\.map/);
    assert.doesNotMatch(push, /deviceToken\.delete/);
  });
  it("el push se lanza DESPUÉS de cada transacción, sin esperar (void)", () => {
    for (const [src, n] of [[events, 2], [org, 1]] as const) {
      const calls = [...src.matchAll(/void pushNotification\(/g)];
      assert.equal(calls.length, n);
      for (const c of calls) {
        const before = src.slice(0, c.index);
        // La llamada está después del cierre de la transacción más cercana ("});" tras prisma.$transaction).
        assert.ok(before.lastIndexOf("prisma.$transaction(") < before.lastIndexOf("});"));
      }
    }
    assert.match(events, /const notice = await notifyEventPublishedIfDue\(tx, created\.id, req\.auth\.id\);\s*return \{ event: created, notice \};/);
    assert.match(events, /const notice = await notifyEventPublishedIfDue\(tx, id, req\.auth\.id\);\s*return \{ event: updated, notice \};/);
  });
});
