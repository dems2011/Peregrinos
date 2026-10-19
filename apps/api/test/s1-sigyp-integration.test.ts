/**
 * SIGyP → Peregrinos (contrato v1). Pruebas sin base de datos: esquemas del paquete compartido, funciones puras de la
 * API y reglas verificadas sobre la fuente (mismo criterio que b5-modules). Lo que exige base (aplicación real por
 * versión, revocación inmediata) está cubierto en SIGyP con un Peregrinos simulado y queda para el e2e local.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  EVENT_TYPES, isAnnouncementVisible, multiNoticeSchema, normalizeLinkCode, SIGYP_EVENT_TYPES, SIGYP_PROFILE_FIELDS, sigypAnnouncementSchema,
  sigypEventSchema, sigypLinkCompleteSchema, sigypManagedFieldsIn, sigypNoticeSchema, sigypProfileSchema, sigypWithdrawSchema, uniqueRecipients,
} from "@peregrinos/shared";
import { CSRF_EXEMPT_ROUTE_PREFIX, requiresCsrfHeader } from "../src/lib/csrf";
import { bearerSigypToken, hashLinkCode, hashSigypToken, newLinkCode, newSigypToken, sameHash, versionOutcome } from "../src/lib/sigyp";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const id = randomUUID();
const ann = { contract: 1, sourceId: id, version: 1, title: "Misa", body: "Domingo 10 h", category: "LITURGIA", startsAt: "2026-10-18T10:00:00.000Z", endsAt: null, publishedAt: "2026-10-17T09:00:00.000Z" };

describe("S1: contrato v1 — esquemas estrictos", () => {
  it("acepta un aviso válido y rechaza campos de más, categorías desconocidas y vigencias invertidas", () => {
    assert.equal(sigypAnnouncementSchema.safeParse(ann).success, true);
    assert.equal(sigypAnnouncementSchema.safeParse({ ...ann, organizationId: randomUUID() }).success, false, "la organización nunca viene en el contenido");
    assert.equal(sigypAnnouncementSchema.safeParse({ ...ann, author: "x" }).success, false);
    assert.equal(sigypAnnouncementSchema.safeParse({ ...ann, category: "OTRA" }).success, false);
    assert.equal(sigypAnnouncementSchema.safeParse({ ...ann, endsAt: "2026-10-18T09:00:00.000Z" }).success, false);
    assert.equal(sigypAnnouncementSchema.safeParse({ ...ann, version: 0 }).success, false);
    assert.equal(sigypAnnouncementSchema.safeParse({ ...ann, contract: 2 }).success, false);
  });
  it("retiro y perfil: estrictos, con los nueve campos públicos exactos", () => {
    assert.equal(sigypWithdrawSchema.safeParse({ contract: 1, sourceId: id, version: 2 }).success, true);
    assert.equal(sigypWithdrawSchema.safeParse({ contract: 1, sourceId: id, version: 2, reason: "interno" }).success, false, "el motivo del retiro no viaja");
    const profile = Object.fromEntries(SIGYP_PROFILE_FIELDS.map((f) => [f, null]));
    assert.equal(sigypProfileSchema.safeParse({ contract: 1, version: 1, profile }).success, true);
    assert.equal(sigypProfileSchema.safeParse({ contract: 1, version: 1, profile: { ...profile, name: "Otra" } }).success, false, "el nombre lo administra Peregrinos");
    assert.equal(sigypProfileSchema.safeParse({ contract: 1, version: 1, profile: { ...profile, website: "http://x.example" } }).success, false);
    assert.equal(sigypProfileSchema.safeParse({ contract: 1, version: 1, profile: { ...profile, address: "x".repeat(241) } }).success, false);
  });
  it("campos administrados por SIGyP en una edición del panel", () => {
    assert.deepEqual(sigypManagedFieldsIn({ name: "x", phone: "1", logo: 1 }), ["phone"]);
    assert.deepEqual(sigypManagedFieldsIn({ name: "x" }), []);
  });
});

describe("S1: vigencia y versiones", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  it("solo vigente: no retirado, comenzado y no vencido (fin exclusivo)", () => {
    assert.equal(isAnnouncementVisible({ withdrawnAt: null, startsAt: "2026-10-17T00:00:00Z", endsAt: null }, now), true);
    assert.equal(isAnnouncementVisible({ withdrawnAt: new Date(), startsAt: "2026-10-17T00:00:00Z", endsAt: null }, now), false);
    assert.equal(isAnnouncementVisible({ withdrawnAt: null, startsAt: "2026-10-18T00:00:00Z", endsAt: null }, now), false, "programado");
    assert.equal(isAnnouncementVisible({ withdrawnAt: null, startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-17T12:00:00Z" }, now), false, "vencido");
  });
  it("una versión no mayor que la guardada se ignora (reintentos idempotentes)", () => {
    assert.equal(versionOutcome(null, 1), "applied");
    assert.equal(versionOutcome(1, 2), "applied");
    assert.equal(versionOutcome(2, 2), "stale");
    assert.equal(versionOutcome(3, 2), "stale");
  });
});

describe("S1: credenciales", () => {
  it("se genera con prefijo y formato fijo; solo se guarda el SHA-256", () => {
    const t = newSigypToken();
    assert.match(t.token, /^pgsig_[A-Za-z0-9_-]{43}$/);
    assert.equal(t.hash, hashSigypToken(t.token));
    assert.equal(t.hash.length, 64);
    assert.ok(!t.hash.includes(t.token.slice(6, 20)));
    assert.equal(t.hint, t.token.slice(-4));
    assert.notEqual(newSigypToken().token, t.token);
  });
  it("Authorization: solo Bearer con el formato exacto", () => {
    const { token } = newSigypToken();
    assert.equal(bearerSigypToken(`Bearer ${token}`), token);
    for (const h of [undefined, "", token, `Basic ${token}`, `Bearer ${token}x`, `Bearer pgsig_corto`, `Bearer ${token} extra`]) assert.equal(bearerSigypToken(h), null, String(h));
    assert.equal(sameHash(hashSigypToken(token), hashSigypToken(token)), true);
    assert.equal(sameHash(hashSigypToken(token), hashSigypToken(`${token}x`)), false);
  });
});

describe("S1: reglas verificadas sobre la fuente", () => {
  const routes = read("src/routes/sigypIntegration.ts");
  it("la organización de toda escritura sale de la credencial, nunca del contenido", () => {
    assert.ok(!/body\.organizationId|v\.organizationId|req\.body\)\.organizationId/.test(routes));
    assert.equal((routes.match(/organizationId: c\.organizationId/g) ?? []).length >= 4, true);
    assert.match(routes, /revokedAt/);
    assert.match(routes, /status !== "APPROVED"/);
  });
  it("aplicación condicionada por versión en la base (no pisa una versión igual o mayor)", () => {
    assert.match(routes, /version: \{ lt: v\.version \}/);
    assert.match(routes, /profileSyncedVersion: \{ lt: v\.version \}/);
  });
  it("el perfil público solo expone avisos no retirados y vigentes, y sin datos internos", () => {
    const pub = read("src/routes/public.ts");
    assert.match(pub, /parishAnnouncement\.findMany\(\{\s*where: \{ organizationId: id, withdrawnAt: null, startsAt: \{ lte: now \}, OR: \[\{ endsAt: null \}, \{ endsAt: \{ gt: now \} \}\] \}/);
    const sel = /announcements[\s\S]*?select: \{([^}]*)\}/.exec(pub.slice(pub.indexOf("parishAnnouncement.findMany")))?.[1] ?? "";
    for (const f of ["sourceId", "version", "withdrawnAt", "receivedAt"]) assert.ok(!sel.includes(f), `no expone ${f}`);
  });
  it("el panel de Peregrinos rechaza editar los campos que administra SIGyP", () => {
    const org = read("src/routes/organization.ts");
    assert.match(org, /PROFILE_MANAGED_BY_SIGYP/);
    assert.match(org, /sigypManagedFieldsIn\(body\)/);
  });
  it("emitir, revocar y liberar exigen parish:profile y segundo factor reciente", () => {
    const adm = read("src/routes/organizationIntegrations.ts");
    assert.match(adm, /requirePermission\("parish:profile"\)/);
    assert.equal((adm.match(/app\.requireRecentMfa/g) ?? []).length, 5);
    assert.match(adm, /tokenHash: t\.hash/);
    assert.ok(!/token: t\.token[^}]*\} *\}\);/.test(adm.split("prisma.integrationClient.create")[1]?.split("});")[0] ?? ""), "la credencial no se guarda en claro");
  });
  it("la migración es aditiva", () => {
    const sql = fs.readFileSync(path.join(root, "prisma/migrations/20261019000000_sigyp_integration/migration.sql"), "utf8").replace(/--[^\n]*/g, "");
    assert.ok(!/\bDROP\b|^\s*DELETE\b|^\s*UPDATE\b|\bTRUNCATE\b|RENAME/im.test(sql));
  });
});

describe("S1: vinculación con código de un solo uso", () => {
  it("formato «PGV-» con ≈100 bits, comparación sin guiones ni mayúsculas y solo hash guardado", () => {
    const a = newLinkCode();
    assert.match(a.code, /^PGV-[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    assert.equal(hashLinkCode(a.code.toLowerCase().replace(/-/g, " ")), a.hash);
    assert.notEqual(newLinkCode().code, a.code);
    for (const bad of ["", "PGV-ABC", "XYZ-ABCDE-FGHJK-MNPQR-STUVW", "PGV-ABCDE-FGHJK-MNPQR-STUV0"]) assert.equal(hashLinkCode(bad), null, bad);
    assert.equal(normalizeLinkCode("PGV-ABCDE-FGHJK-MNPQR-STUVI"), null, "sin letras ambiguas (I, L, O, 0, 1)");
  });
  it("completar exige la instalación y nada más", () => {
    assert.equal(sigypLinkCompleteSchema.safeParse({ code: "PGV-ABCDE-FGHJK-MNPQR-STUVW", installation: { parishCode: "PAR01", label: "Secretaría" } }).success, true);
    assert.equal(sigypLinkCompleteSchema.safeParse({ code: "PGV-ABCDE-FGHJK-MNPQR-STUVW", installation: { parishCode: "PAR01", label: "Secretaría" }, organizationId: randomUUID() }).success, false);
  });
  it("la fuente: solo el SUPERADMIN genera códigos; se consume en la misma sentencia y una sola vez", () => {
    const adm = read("src/routes/organizationIntegrations.ts");
    assert.match(adm, /req\.auth\.role !== "SUPERADMIN"/);
    const r = read("src/routes/sigypIntegration.ts");
    assert.match(r, /integrationLinkCode\.updateMany\(\{ where: \{ codeHash: hash, usedAt: null, revokedAt: null, expiresAt: \{ gt: new Date\(\) \} \}/);
    assert.match(r, /Código de vinculación inválido, vencido o ya usado/);
    assert.match(r, /app\.post\("\/unlink"/);
  });
});

describe("S1: eventos desde SIGyP con el modelo Event de Peregrinos", () => {
  const ev = { contract: 1, sourceId: randomUUID(), version: 1, title: "Misa criolla", description: null, eventType: "LITURGICAL_CELEBRATION", startsAt: "2026-11-01T13:00:00Z", endsAt: null, timezone: "America/Argentina/Buenos_Aires", locationName: "Templo", address: null, attendanceMode: "IN_PERSON", onlineUrl: null, visibility: "PUBLIC" };
  it("los tipos coinciden con EVENT_TYPES", () => assert.deepEqual([...SIGYP_EVENT_TYPES], [...EVENT_TYPES]));
  it("esquema estricto con reglas de modalidad", () => {
    assert.equal(sigypEventSchema.safeParse(ev).success, true);
    assert.equal(sigypEventSchema.safeParse({ ...ev, registrationOpen: true }).success, false, "sin inscripciones desde SIGyP");
    assert.equal(sigypEventSchema.safeParse({ ...ev, attendanceMode: "ONLINE", locationName: null }).success, false, "virtual exige enlace");
    assert.equal(sigypEventSchema.safeParse({ ...ev, attendanceMode: "ONLINE", locationName: null, onlineUrl: "https://meet.example/x" }).success, true);
    assert.equal(sigypEventSchema.safeParse({ ...ev, attendanceMode: "HYBRID", onlineUrl: "http://meet.example/x" }).success, false, "solo https");
    assert.equal(sigypEventSchema.safeParse({ ...ev, locationName: null }).success, false, "presencial exige lugar o dirección");
    assert.equal(sigypEventSchema.safeParse({ ...ev, timezone: "Hora local" }).success, false);
  });
  it("la fuente: no avisa a los seguidores, solo INFO/LOCATION, versión en la base y el panel no lo edita", () => {
    const r = read("src/routes/sigypIntegration.ts");
    const events = r.slice(r.indexOf('app.put("/events/:sourceId"'), r.indexOf("/* ---------- Avisos multigrupo"));
    assert.ok(!/notifyFollowers|notifyEventPublishedIfDue|pushNotification/.test(events), "publicar un evento no envía avisos");
    assert.match(events, /publishedNotifiedAt: new Date\(\)/);
    assert.match(events, /\["INFO", "LOCATION"\]/);
    assert.match(events, /sourceVersion: \{ lt: v\.version \}/);
    assert.match(read("src/routes/events.ts"), /EVENT_MANAGED_BY_SIGYP/);
    assert.match(read("src/routes/eventCover.ts"), /EVENT_MANAGED_BY_SIGYP/);
  });
});

describe("S1: avisos multigrupo", () => {
  it("una persona en dos grupos recibe un solo aviso", () => {
    assert.deepEqual(uniqueRecipients([["a", "b"], ["b", "c"], []]), ["a", "b", "c"]);
  });
  it("esquemas: grupos válidos, sin repetir; urgente con motivo y como push; confirmación obligatoria", () => {
    const base = { title: "Reunión", body: "Mañana 19 h", audiences: ["FOLLOWERS", "STAFF:ADMIN"], delivery: "INBOX", confirmedRecipients: 3 };
    assert.equal(multiNoticeSchema.safeParse(base).success, true);
    assert.equal(multiNoticeSchema.safeParse({ ...base, audiences: ["FOLLOWERS", "FOLLOWERS"] }).success, false);
    assert.equal(multiNoticeSchema.safeParse({ ...base, audiences: ["CATEQUISTAS"] }).success, false);
    assert.equal(multiNoticeSchema.safeParse({ ...base, urgent: true, delivery: "PUSH" }).success, false, "urgente sin motivo");
    assert.equal(multiNoticeSchema.safeParse({ ...base, urgent: true, urgentReason: "Corte de calle por la procesión" }).success, false, "urgente solo push");
    assert.equal(multiNoticeSchema.safeParse({ ...base, urgent: true, delivery: "PUSH", urgentReason: "Corte de calle por la procesión" }).success, true);
    const { confirmedRecipients: _c, ...noConfirm } = base;
    assert.equal(multiNoticeSchema.safeParse(noConfirm).success, false);
    assert.equal(sigypNoticeSchema.safeParse({ contract: 1, sourceId: randomUUID(), title: "Hola", body: "Texto", audiences: ["FOLLOWERS"], delivery: "PUSH", urgent: true }).success, false, "SIGyP no envía urgentes");
  });
  it("la fuente: permisos en el servidor, total confirmado, sin listas de personas y una vez por sourceId", () => {
    const org = read("src/routes/organization.ts");
    assert.match(org, /AUDIENCE_NOT_ALLOWED/);
    assert.match(org, /"user:manage"/);
    assert.match(org, /RECIPIENTS_CHANGED/);
    assert.match(org, /URGENT_NOT_ALLOWED/);
    assert.match(read("src/lib/notifications.ts"), /uniqueRecipients\(/);
    const r = read("src/routes/sigypIntegration.ts");
    const aud = r.slice(r.indexOf('app.get("/notices/audiences"'), r.indexOf('app.post("/notices/:sourceId"'));
    assert.match(aud, /return \{ counts: r\.counts, uniqueRecipients \}/, "solo cantidades");
    assert.match(r, /organizationId_sourceSystem_sourceId/);
  });
  it("CSRF: la integración servidor a servidor no exige el encabezado del navegador; todo lo demás sí", () => {
    // Regresión (e2e real SIGyP ↔ Peregrinos): el gancho global rechazaba con 403 las llamadas de SIGyP.
    for (const r of ["/api/integrations/sigyp/v1/link/preview", "/api/integrations/sigyp/v1/link/complete", "/api/integrations/sigyp/v1/events/:sourceId", "/api/integrations/sigyp/v1/notices/:sourceId"]) {
      assert.equal(requiresCsrfHeader("POST", r), false, r);
      assert.equal(requiresCsrfHeader("PUT", r), false, r);
    }
    for (const r of ["/api/organization/integrations/sigyp/link-codes", "/api/auth/login", "/api/integrations/sigyp/v1", "/api/integrations/sigyp/v10/x", undefined]) {
      assert.equal(requiresCsrfHeader("POST", r), true, String(r));
    }
    assert.equal(requiresCsrfHeader("GET", "/api/auth/me"), false);
    assert.equal(CSRF_EXEMPT_ROUTE_PREFIX, "/api/integrations/sigyp/v1/");
    // Se decide por el patrón de ruta registrado, nunca por la URL cruda.
    assert.ok(read("src/app.ts").includes("requiresCsrfHeader(req.method, req.routeOptions?.url)"));
    // La excepción solo es segura porque esas rutas no usan cookies ni sesión de usuario.
    const r = read("src/routes/sigypIntegration.ts");
    assert.doesNotMatch(r, /req\.cookies|req\.auth\b|app\.authenticate|requirePermission/);
    assert.ok(r.includes("bearerSigypToken(req.headers.authorization)"));
  });
  it("tarjeta de evento: uno sin inscripción (los informativos de SIGyP) no muestra costo ni «la inscripción no está abierta»", () => {
    // Regresión de la revisión visual 2026-10-19: «Sin inscripción», «Inscripción sin costo» y «La inscripción no está
    // abierta» aparecían juntos en el muro para los eventos que publica SIGyP (solo INFO/LOCATION).
    const v = fs.readFileSync(path.join(root, "..", "web", "src", "components", "ParishProfileView.tsx"), "utf8");
    assert.ok(v.includes('e.phase !== "FINISHED" && e.registrationState !== "DISABLED" && (\n        <div className="muted small">'), "línea de costo y cupo");
    assert.ok(v.includes('e.phase !== "FINISHED" && e.registrationState !== "DISABLED" && <span className="muted small">'), "mensaje de inscripción");
  });
});
