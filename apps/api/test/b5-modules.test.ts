/**
 * B5 — Herramientas parroquiales (agenda, donaciones, boletín, certificados, transmisiones, seguimiento GPS). Tests sin
 * base de datos: esquemas del paquete compartido, funciones puras de la API y reglas verificadas sobre la fuente. Las
 * pruebas contra la base están en el e2e local.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CERTIFICATE_STATUSES, CERTIFICATE_TRANSITIONS, certificateLookupSchema, certificateRequestSchema, certificateUpdateSchema,
  donationCampaignSchema, followPreferencesSchema, isAllowedDonationUrl, locationPingSchema, scheduleItemSchema,
} from "@peregrinos/shared";
import { parseYouTubeVideoId } from "../src/lib/youtube";
import { certificateAccessHash, newTrackingCode } from "../src/lib/certificates";
import { trackingOpen } from "../src/lib/tracking";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("B5: donaciones — solo enlaces de Mercado Pago", () => {
  it("acepta enlaces https de Mercado Pago", () => {
    for (const u of ["https://mpago.la/2abcXYZ", "https://mpago.li/1x", "https://link.mercadopago.com.ar/parroquia", "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1", "https://mercadopago.com/x"]) {
      assert.ok(isAllowedDonationUrl(u), u);
    }
  });
  it("rechaza http, otros dominios, dominios parecidos, usuario/contraseña y puertos", () => {
    for (const u of ["http://mpago.la/x", "https://mpago.la.evil.com/x", "https://evilmercadopago.com/x", "https://mercadopago.com.evil.ar/x",
      "https://user:pw@mpago.la/x", "https://mpago.la:8443/x", "javascript:alert(1)", "mpago.la/x", "https://paypal.com/x"]) {
      assert.ok(!isAllowedDonationUrl(u), u);
    }
  });
  it("la campaña exige finalidad, beneficiario y enlace válido, y es estricta", () => {
    const ok = { title: "Obras", purpose: "WORKS", beneficiary: "Parroquia San José", url: "https://mpago.la/abc" };
    assert.equal(donationCampaignSchema.safeParse(ok).success, true);
    assert.equal(donationCampaignSchema.safeParse({ ...ok, url: "https://example.com" }).success, false);
    assert.equal(donationCampaignSchema.safeParse({ ...ok, beneficiary: "" }).success, false);
    assert.equal(donationCampaignSchema.safeParse({ ...ok, organizationId: "x" }).success, false);
  });
});

describe("B5: agenda pastoral", () => {
  const base = { kind: "MASS", title: "Misa dominical", startTime: "10:00" };
  it("exactamente uno: día de la semana o fecha", () => {
    assert.equal(scheduleItemSchema.safeParse({ ...base, weekday: 0 }).success, true);
    assert.equal(scheduleItemSchema.safeParse({ ...base, date: "2026-12-24" }).success, true);
    assert.equal(scheduleItemSchema.safeParse(base).success, false);
    assert.equal(scheduleItemSchema.safeParse({ ...base, weekday: 0, date: "2026-12-24" }).success, false);
  });
  it("horas válidas y fin posterior al inicio", () => {
    assert.equal(scheduleItemSchema.safeParse({ ...base, weekday: 1, startTime: "24:00" }).success, false);
    assert.equal(scheduleItemSchema.safeParse({ ...base, weekday: 1, endTime: "09:00" }).success, false);
    assert.equal(scheduleItemSchema.safeParse({ ...base, weekday: 1, endTime: "11:00" }).success, true);
    assert.equal(scheduleItemSchema.safeParse({ ...base, weekday: 7 }).success, false);
  });
});

describe("B5: boletín por correo — preferencia del seguidor", () => {
  it("solo bulletinEmail booleano", () => {
    assert.equal(followPreferencesSchema.safeParse({ bulletinEmail: true }).success, true);
    assert.equal(followPreferencesSchema.safeParse({ bulletinEmail: "sí" }).success, false);
    assert.equal(followPreferencesSchema.safeParse({ bulletinEmail: true, userId: "x" }).success, false);
  });
  it("PATCH /follows/:id: cuenta del peregrino, solo su propio seguimiento, auditado", () => {
    const src = read("src/routes/accountSocial.ts");
    const r = src.slice(src.indexOf('app.patch("/follows/:organizationId"'), src.indexOf('app.post("/follows"'));
    assert.match(r, /limited\(30\)/);
    assert.match(r, /where: \{ organizationId, userId: req\.pilgrimAccount\.id \}/);
    assert.match(r, /r\.count !== 1/);
    assert.match(r, /PARISH_FOLLOW_PREFERENCES_CHANGED/);
  });
  it("el correo del boletín se envía solo a quien lo pidió y lleva el enlace para darse de baja", () => {
    const src = read("src/routes/bulletins.ts");
    assert.match(src, /bulletinEmail: true/);
    assert.match(src, /preferencesUrl: `\$\{cfg\.WEB_ORIGIN\}\/cuenta\/parroquias`/);
  });
});

describe("B5: certificados", () => {
  it("código CERT-XXXX-XXXX sin caracteres ambiguos y aceptado por la consulta", () => {
    for (let i = 0; i < 200; i++) {
      const c = newTrackingCode();
      assert.match(c, /^CERT-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      assert.equal(certificateLookupSchema.safeParse({ code: c.toLowerCase(), email: "a@b.cd" }).success, true);
    }
  });
  it("la clave de consulta depende del código y del correo (sin distinguir mayúsculas ni espacios)", () => {
    assert.equal(certificateAccessHash("CERT-AAAA-BBBB", "Ana@X.com"), certificateAccessHash(" cert-aaaa-bbbb ", "ana@x.com "));
    assert.notEqual(certificateAccessHash("CERT-AAAA-BBBB", "ana@x.com"), certificateAccessHash("CERT-AAAA-BBBB", "otra@x.com"));
  });
  it("transiciones: DELIVERED y REJECTED son finales; todas apuntan a estados conocidos", () => {
    assert.deepEqual(CERTIFICATE_TRANSITIONS.DELIVERED, []);
    assert.deepEqual(CERTIFICATE_TRANSITIONS.REJECTED, []);
    for (const s of CERTIFICATE_STATUSES) for (const t of CERTIFICATE_TRANSITIONS[s]) assert.ok(CERTIFICATE_STATUSES.includes(t), `${s}→${t}`);
    assert.ok(!CERTIFICATE_TRANSITIONS.RECEIVED.includes("DELIVERED"));
  });
  it("entregar exige confirmar la identidad de quien retira", () => {
    assert.equal(certificateUpdateSchema.safeParse({ status: "DELIVERED" }).success, false);
    assert.equal(certificateUpdateSchema.safeParse({ status: "DELIVERED", identityVerified: true }).success, true);
  });
  it("la solicitud pública exige aceptar la privacidad y rechaza el campo trampa", () => {
    const ok = { type: "BAPTISM", requesterName: "Ana Pérez", requesterEmail: "ana@x.com", subjectName: "Juan Pérez", acceptPrivacy: true };
    assert.equal(certificateRequestSchema.safeParse(ok).success, true);
    assert.equal(certificateRequestSchema.safeParse({ ...ok, acceptPrivacy: false }).success, false);
    assert.equal(certificateRequestSchema.safeParse({ ...ok, website: "http://spam" }).success, false);
  });
});

describe("B5: transmisiones de YouTube", () => {
  const id = "dQw4w9WgXcQ";
  it("extrae el id de los formatos de enlace habituales", () => {
    for (const u of [id, `https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?t=3`, `https://m.youtube.com/watch?v=${id}&feature=share`,
      `https://www.youtube.com/live/${id}`, `https://www.youtube.com/embed/${id}`, `https://www.youtube.com/shorts/${id}`]) {
      assert.equal(parseYouTubeVideoId(u), id, u);
    }
  });
  it("rechaza otros dominios, esquemas y canales sin video", () => {
    for (const u of [`https://youtube.com.evil.com/watch?v=${id}`, `javascript:alert('${id}')`, "https://www.youtube.com/@parroquia", `ftp://youtu.be/${id}`, "https://youtu.be/corto"]) {
      assert.equal(parseYouTubeVideoId(u), null, u);
    }
  });
});

describe("B5: seguimiento GPS", () => {
  it("solo con el seguimiento activado y el evento EN CURSO", () => {
    assert.equal(trackingOpen({ trackingEnabled: true, status: "IN_PROGRESS" }), true);
    assert.equal(trackingOpen({ trackingEnabled: false, status: "IN_PROGRESS" }), false);
    assert.equal(trackingOpen({ trackingEnabled: true, status: "SCHEDULED" }), false);
    assert.equal(trackingOpen({ trackingEnabled: true, status: "FINISHED" }), false);
  });
  it("la posición valida rangos y es estricta", () => {
    const ok = { latitude: -34.6, longitude: -58.4, accuracy: 12, recordedAt: new Date().toISOString() };
    assert.equal(locationPingSchema.safeParse(ok).success, true);
    assert.equal(locationPingSchema.safeParse({ ...ok, latitude: 91 }).success, false);
    assert.equal(locationPingSchema.safeParse({ ...ok, longitude: -181 }).success, false);
    assert.equal(locationPingSchema.safeParse({ ...ok, participantId: "x" }).success, false);
  });
  it("la API exige consentimiento previo, limita la frecuencia y borra al dejar de compartir", () => {
    const src = read("src/routes/pilgrimTracking.ts");
    const ping = src.slice(src.indexOf('app.post("/ping"'), src.indexOf("Dejar de compartir"));
    assert.match(ping, /rateLimit: \{ max: 6, timeWindow: "1 minute" \}/);
    assert.match(ping, /locationShare\.updateMany/); // nunca crea: sin consentimiento no se guarda nada
    assert.doesNotMatch(ping, /locationShare\.(create|upsert)/);
    assert.match(ping, /NO_CONSENT/);
    assert.match(src.slice(src.indexOf('app.delete("/"')), /locationShare\.deleteMany\(\{ where: \{ participantId \} \}\)/);
  });
});
