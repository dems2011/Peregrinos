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
  isAnnouncementVisible, SIGYP_PROFILE_FIELDS, sigypAnnouncementSchema, sigypManagedFieldsIn, sigypProfileSchema, sigypWithdrawSchema,
} from "@peregrinos/shared";
import { bearerSigypToken, hashSigypToken, newSigypToken, sameHash, versionOutcome } from "../src/lib/sigyp";

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
    assert.equal((adm.match(/app\.requireRecentMfa/g) ?? []).length, 3);
    assert.match(adm, /tokenHash: t\.hash/);
    assert.ok(!/token: t\.token[^}]*\} *\}\);/.test(adm.split("prisma.integrationClient.create")[1]?.split("});")[0] ?? ""), "la credencial no se guarda en claro");
  });
  it("la migración es aditiva", () => {
    const sql = fs.readFileSync(path.join(root, "prisma/migrations/20261019000000_sigyp_integration/migration.sql"), "utf8").replace(/--[^\n]*/g, "");
    assert.ok(!/\bDROP\b|^\s*DELETE\b|^\s*UPDATE\b|\bTRUNCATE\b|RENAME/im.test(sql));
  });
});
