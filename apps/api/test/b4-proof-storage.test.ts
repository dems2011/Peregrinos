/**
 * Comprobantes de pago dentro de la base (PaymentProof.data): el disco del servidor no persiste en Render ni en Cloud
 * Run. Tests sin base de datos: funciones de lib/storage.ts y reglas verificadas sobre la fuente.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-0000";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
process.env.UPLOAD_DIR = path.join(__dirname, ".no-existe-uploads");

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

describe("Comprobantes en la base", () => {
  it("prepareProof valida el tipo real y no escribe en disco", async () => {
    const { prepareProof } = await import("../src/lib/storage");
    const p = prepareProof(PNG);
    assert.match(p.key, /^[0-9a-f-]{36}\.png$/);
    assert.equal(p.mime, "image/png");
    assert.equal(p.size, PNG.length);
    assert.match(p.sha256, /^[0-9a-f]{64}$/);
    assert.equal(fs.existsSync(process.env.UPLOAD_DIR!), false);
    assert.throws(() => prepareProof(Buffer.from("hola, no soy una imagen")), /JPG, PNG o WEBP/);
  });
  it("openProof sirve los bytes guardados en la base", async () => {
    const { openProof } = await import("../src/lib/storage");
    const out = await openProof({ storageKey: "00000000-0000-0000-0000-000000000000.png", data: new Uint8Array(PNG) });
    assert.ok(Buffer.isBuffer(out) && out.equals(PNG));
  });
  it("comprobante anterior sin archivo en disco → 404 claro (no 500)", async () => {
    const { openProof } = await import("../src/lib/storage");
    await assert.rejects(openProof({ storageKey: "00000000-0000-0000-0000-000000000000.png", data: null }), /ya no está disponible/);
    await assert.rejects(openProof({ storageKey: "../../etc/passwd", data: null }), /no encontrado/);
  });
  it("el alta guarda los bytes y las consultas de listado nunca seleccionan `data`", () => {
    const pilgrim = read("src/routes/pilgrim.ts");
    const regs = read("src/routes/registrations.ts");
    assert.match(pilgrim, /storageKey: saved\.key, data: new Uint8Array\(file\)/);
    assert.doesNotMatch(pilgrim + regs, /proofs: \{[^}]*select: \{[^}]*data: true/);
    assert.match(regs, /const stream = await openProof\(proof\);/);
  });
  it("migración aditiva: columna nula, sin tocar los comprobantes existentes", () => {
    const sql = read("prisma/migrations/20261017000000_payment_proof_data/migration.sql").replace(/^--.*$/gm, "");
    assert.match(sql, /ALTER TABLE "PaymentProof" ADD COLUMN "data" BYTEA;/);
    assert.doesNotMatch(sql, /NOT NULL|DROP|DELETE|UPDATE/);
  });
});
