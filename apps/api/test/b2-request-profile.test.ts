/**
 * B2 — Perfil público en la solicitud de parroquia (sitio web, redes, foto 2:1) y estructura de suscripción.
 * Tests sin base de datos; la migración se ensaya además contra PostgreSQL local.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PARISH_IMAGE_SPEC, PARISH_REQUEST_PHOTO_SPEC as SPEC, normalizeSocial, normalizeWebsite, organizationRequestSchema,
  resubmitOrganizationRequestSchema,
} from "@peregrinos/shared";
import { validateImage } from "../src/lib/image";
import { AppError } from "../src/lib/errors";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const readWeb = (p: string) => fs.readFileSync(path.join(root, "..", "web", p), "utf8");

/** PNG mínimo con la cabecera IHDR (lo único que leen sniff e imageSize). */
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20);
  return b;
}
const rule = { label: "Foto de la parroquia", mimes: SPEC.mimes, maxBytes: SPEC.maxBytes, minWidth: SPEC.minWidth, minHeight: SPEC.minHeight, maxPx: SPEC.maxPx, minRatio: SPEC.minRatio, maxRatio: SPEC.maxRatio };
const codeOf = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return (e as AppError).code; } };

describe("B2: sitio web", () => {
  for (const [input, out] of [
    ["https://parroquia.org", "https://parroquia.org/"],
    ["parroquia.org", "https://parroquia.org/"],
    ["http://www.parroquia.org.ar/misas", "http://www.parroquia.org.ar/misas"],
  ] as const) it(`acepta ${input}`, () => assert.equal(normalizeWebsite(input), out));
  for (const bad of ["", "parroquia", "javascript:alert(1)", "ftp://parroquia.org", "https://usuario:clave@parroquia.org", "https://parro quia.org", `https://${"a".repeat(300)}.org`]) {
    it(`rechaza ${JSON.stringify(bad.slice(0, 40))}`, () => assert.equal(normalizeWebsite(bad), null));
  }
});

describe("B2: redes sociales", () => {
  it("usuario con o sin @ → @usuario", () => {
    assert.equal(normalizeSocial("instagram", "parroquia.san_jose"), "@parroquia.san_jose");
    assert.equal(normalizeSocial("youtube", "@ParroquiaSJ"), "@ParroquiaSJ");
  });
  it("enlace del dominio correcto (acepta www/m; http → https; se conserva el enlace)", () => {
    assert.equal(normalizeSocial("instagram", "http://www.instagram.com/parroquia"), "https://www.instagram.com/parroquia");
    assert.equal(normalizeSocial("facebook", "https://m.facebook.com/parroquia"), "https://m.facebook.com/parroquia");
    assert.equal(normalizeSocial("youtube", "https://youtube.com/@parroquia"), "https://youtube.com/@parroquia");
  });
  for (const [net, bad] of [
    ["instagram", "https://facebook.com/parroquia"], ["facebook", "https://evil.com/facebook.com/x"], ["youtube", "https://youtube.com/"],
    ["instagram", "con espacios"], ["facebook", "<script>"], ["instagram", "https://instagram.com.evil.com/x"],
  ] as const) it(`${net} rechaza ${bad}`, () => assert.equal(normalizeSocial(net, bad), null));
});

describe("B2: esquema de la solicitud", () => {
  const base = { parishName: "Parroquia San José", contactName: "Ana", contactEmail: "ana@ejemplo.org", countryCode: "AR", acceptTerms: true as const };
  it("los campos del perfil público son opcionales (la solicitud de antes sigue siendo válida)", () => {
    const r = organizationRequestSchema.safeParse(base);
    assert.ok(r.success && r.data.website === undefined && r.data.instagram === undefined);
  });
  it("normaliza sitio web y redes", () => {
    const r = organizationRequestSchema.safeParse({ ...base, website: "parroquia.org", instagram: "parroquia", facebook: "https://www.facebook.com/parroquia", youtube: "@parroquia" });
    assert.ok(r.success);
    assert.deepEqual([r.data.website, r.data.instagram, r.data.facebook, r.data.youtube], ["https://parroquia.org/", "@parroquia", "https://www.facebook.com/parroquia", "@parroquia"]);
  });
  it("vacíos → ausentes", () => {
    const r = organizationRequestSchema.safeParse({ ...base, website: " ", instagram: "" });
    assert.ok(r.success && r.data.website === undefined && r.data.instagram === undefined);
  });
  it("rechaza red de otro dominio y sitio inválido con mensaje en español", () => {
    const r = organizationRequestSchema.safeParse({ ...base, instagram: "https://facebook.com/x", website: "no es web" });
    assert.ok(!r.success);
    const msgs = r.error.issues.map((i) => i.message).join(" | ");
    assert.match(msgs, /Instagram: escribe @usuario/); assert.match(msgs, /Sitio web: escribe una dirección/);
  });
  it("TikTok queda fuera de la solicitud (se agrega luego desde el perfil)", () =>
    assert.equal(organizationRequestSchema.safeParse({ ...base, tiktok: "@parroquia" }).success, false));
  it("la foto no viaja en el JSON ni se aceptan campos de suscripción", () => {
    for (const extra of [{ photo: "data:image/png;base64,AAAA" }, { subscriptionStatus: "ACTIVE" }, { provider: "GOOGLE_PLAY" }]) {
      assert.equal(organizationRequestSchema.safeParse({ ...base, ...extra }).success, false);
    }
  });
  it("la nueva presentación acepta los mismos campos", () => {
    const { acceptTerms: _t, ...fields } = base;
    assert.ok(resubmitOrganizationRequestSchema.safeParse({ ...fields, token: "x".repeat(30), website: "parroquia.org", youtube: "@parroquia" }).success);
  });
});

describe("B2: foto principal 2:1", () => {
  it("la especificación es compatible con la imagen de la parroquia (se copia al aprobar)", () => {
    assert.equal(SPEC.outputWidth / SPEC.outputHeight, SPEC.ratio);
    assert.ok(SPEC.minRatio >= PARISH_IMAGE_SPEC.cover.minRatio && SPEC.maxRatio <= PARISH_IMAGE_SPEC.cover.maxRatio);
    assert.ok(SPEC.minWidth >= PARISH_IMAGE_SPEC.cover.minWidth && SPEC.minHeight >= PARISH_IMAGE_SPEC.cover.minHeight);
    assert.ok(SPEC.maxBytes <= PARISH_IMAGE_SPEC.cover.maxBytes && SPEC.maxBytes <= 2097152);
  });
  it("acepta 1600 × 800 y 1200 × 600", () => {
    assert.equal(validateImage(png(1600, 800), rule).width, 1600);
    assert.equal(validateImage(png(1200, 600), rule).height, 600);
  });
  it("rechaza proporción distinta de 2:1, foto chica, demasiado grande o de otro tipo", () => {
    assert.equal(codeOf(() => validateImage(png(1600, 900), rule)), "IMAGE_BAD_RATIO");
    assert.equal(codeOf(() => validateImage(png(1300, 2600), rule)), "IMAGE_BAD_RATIO");
    assert.equal(codeOf(() => validateImage(png(1000, 500), rule)), "IMAGE_TOO_SMALL");
    assert.equal(codeOf(() => validateImage(png(7000, 3500), rule)), "IMAGE_TOO_BIG");
    assert.equal(codeOf(() => validateImage(Buffer.from("GIF89a" + "\0".repeat(40)), rule)), "INVALID_IMAGE_TYPE");
  });
});

describe("B2: API", () => {
  const routes = read("src/routes/organizationRequests.ts");
  const platform = read("src/routes/platform.ts");
  it("la foto se sube con el token privado en cabecera (nunca en la URL)", () => {
    assert.match(routes, /app\.put\("\/photo"/);
    assert.match(routes, /req\.headers\["x-request-token"\]/);
    assert.doesNotMatch(routes, /\/photo\?token/);
    assert.match(read("src/app.ts"), /allowedHeaders: \["Content-Type", "X-PG-Client", "X-Request-Token"\]/);
  });
  it("la foto solo se cambia en revisión o rechazada, con límite de pedidos y validación estricta", () => {
    assert.match(routes, /PHOTO_EDITABLE = new Set\(\["PENDING_REVIEW", "REJECTED"\]\)/);
    assert.match(routes, /app\.put\("\/photo", \{ config: \{ rateLimit: \{ max: 10, timeWindow: "15 minutes" \} \} \}/);
    assert.match(routes, /validateImage\(buf, \{ label: "Foto de la parroquia"/);
    assert.match(routes, /organizationRequestPhoto\.upsert/);
  });
  it("el estado público informa si hay foto, sin exponer la imagen", () => {
    assert.match(routes, /hasPhoto/);
    assert.doesNotMatch(routes, /reply\.header\("Content-Type", photo\.mime\)/);
  });
  it("la plataforma ve la foto con su sesión y, al aprobar, copia web, redes y foto (PARISH_COVER) en la misma transacción", () => {
    assert.match(platform, /app\.get\("\/requests\/:id\/photo", guard/);
    assert.match(platform, /website: request\.website, instagram: request\.instagram, facebook: request\.facebook, youtube: request\.youtube/);
    const approve = platform.slice(platform.indexOf('app.post("/requests/:id/approve"'), platform.indexOf('app.post("/requests/:id/reject"'));
    const tx = approve.slice(approve.indexOf("prisma.$transaction"), approve.indexOf("sendInvitationEmail"));
    assert.match(tx, /kind: "PARISH_COVER"/);
    assert.match(tx, /tx\.organizationRequestPhoto\.findUnique/);
  });
  it("nada de cobros todavía: ninguna ruta usa OrganizationSubscription", () => {
    for (const f of fs.readdirSync(path.join(root, "src/routes"))) {
      assert.doesNotMatch(read(`src/routes/${f}`), /organizationSubscription/, f);
    }
  });
});

describe("B2: web", () => {
  it("las subidas a rutas PUT usan PUT (logo/imagen de la parroquia, fondo de credencial, foto de la solicitud)", () => {
    assert.match(readWeb("src/app/(app)/configuracion/parroquia/page.tsx"), /upload\(`\/organization\/media\/\$\{kind\}`, form, "PUT"\)/);
    assert.match(readWeb("src/app/(app)/evento/credencial/page.tsx"), /upload\(`\/events\/\$\{eid\}\/credentials\/background`, form, "PUT"\)/);
    assert.match(readWeb("src/app/solicitud-parroquia/page.tsx"), /"\/organization-requests\/photo", form, "PUT", \{ "X-Request-Token": token \}/);
  });
  it("el formulario mantiene los campos existentes y agrega el perfil público", () => {
    const page = readWeb("src/app/solicitud-parroquia/page.tsx");
    for (const id of ['id="pn"', 'id="cn"', 'id="ce"', 'id="cp"', 'id="ad"', 'id="nt"', "AreaPicker", 'id="ws"', "sn-${key}", "<PhotoCropper"]) assert.ok(page.includes(id), id);
    assert.doesNotMatch(page, /tiktok/i);
  });
  it("el recorte exporta 2:1 dentro del límite de peso", () => {
    const c = readWeb("src/components/PhotoCropper.tsx");
    assert.match(c, /outH = Math\.round\(outW \/ SPEC\.ratio\)/);
    assert.match(c, /b\.size > SPEC\.maxBytes/);
  });
});

describe("B2: migración", () => {
  const sql = read("prisma/migrations/20261014000000_parish_request_profile_subscription/migration.sql");
  const statements = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  it("es solo aditiva", () => {
    assert.doesNotMatch(statements, /\bDROP\b|\bRENAME\b|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bALTER\s+COLUMN\b|\bUPDATE\s+"/i);
    assert.match(statements, /ADD COLUMN\s+"facebook" TEXT,/);
  });
  it("la BD exige foto válida y suscripción coherente", () => {
    for (const c of ["OrganizationRequestPhoto_mime_allowed", "OrganizationRequestPhoto_size_matches", "OrganizationRequestPhoto_sha256_hex",
      "OrganizationSubscription_status_needs_provider", "OrganizationSubscription_google_play_product", "OrganizationSubscription_external_ref_hash"]) assert.match(sql, new RegExp(c));
    assert.match(sql, /BETWEEN 1 AND 2097152/);
    assert.match(sql, /"OrganizationSubscription_organizationId_key"/);
  });
});
