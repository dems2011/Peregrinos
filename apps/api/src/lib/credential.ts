import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { CREDENTIAL_SPEC, formatParticipantNumber, qrContent } from "@peregrinos/shared";

export interface CardData {
  number: number;
  qrToken: string;
  /** Solo se imprime si se pide (por defecto la credencial no lleva datos personales). */
  name?: string;
}

export interface CardContext {
  parish: string;
  eventName: string;
  /** B1: fondo propio de la parroquia (PNG/JPEG validado con la proporción CR80 vertical). */
  background?: Buffer | null;
}

// B1: credencial SIEMPRE vertical, tamaño CR80 (54 × 85,6 mm) en puntos PDF.
const MM = 72 / 25.4;
const W = CREDENTIAL_SPEC.widthMm * MM, H = CREDENTIAL_SPEC.heightMm * MM, GAP = 8, COLS = 3, ROWS = 3;
const NAVY = "#0B3158", BLUE = "#1677FF", TEXT = "#17324D", MUTED = "#6D7D8E", LINE = "#E2E8EF";
const ZONE = CREDENTIAL_SPEC.dataZoneMm;

async function qrPng(token: string) {
  return QRCode.toBuffer(qrContent(token), { type: "png", width: 420, margin: 1, errorCorrectionLevel: "M" });
}

/** Diseño estándar de Peregrinos (vertical): cabecera con la parroquia, número grande, QR y aviso. */
async function drawStandard(doc: PDFKit.PDFDocument, x: number, y: number, c: CardData, ctx: CardContext) {
  doc.save();
  doc.roundedRect(x, y, W, H, 10).clip();
  doc.rect(x, y, W, H).fill("#FFFFFF");
  doc.rect(x, y, W, 64).fill(NAVY);
  doc.rect(x, y + 64, W, 3).fill(BLUE);
  doc.restore();

  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10.5)
    .text(ctx.parish, x + 10, y + 11, { width: W - 20, height: 28, align: "center", ellipsis: true });
  doc.fillColor("#BFD4EE").font("Helvetica").fontSize(7)
    .text(ctx.eventName, x + 10, y + 44, { width: W - 20, height: 10, align: "center", lineBreak: false, ellipsis: true });

  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(6.5).text("N.º DE PEREGRINO", x, y + 76, { width: W, align: "center", lineBreak: false });
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(34).text(formatParticipantNumber(c.number), x, y + 85, { width: W, align: "center", lineBreak: false });
  if (c.name) {
    doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(7.5).text(c.name, x + 8, y + 122, { width: W - 16, height: 10, align: "center", lineBreak: false, ellipsis: true });
  }

  const q = 84, qx = x + (W - q) / 2, qy = y + 136;
  doc.roundedRect(qx - 5, qy - 5, q + 10, q + 10, 7).lineWidth(0.8).fillAndStroke("#FFFFFF", LINE);
  doc.image(await qrPng(c.qrToken), qx, qy, { width: q, height: q });
  doc.fillColor(MUTED).font("Helvetica").fontSize(5.5)
    .text("Presenta esta credencial en cada punto de control", x + 8, y + H - 14, { width: W - 16, align: "center", lineBreak: false, ellipsis: true });
}

/**
 * Diseño propio: el fondo cubre la tarjeta entera sin deformarse (escala "cover" y recorte a la tarjeta); en la zona
 * segura se dibuja un panel blanco con el número, el QR y, si se pide, el nombre (siempre legibles y escaneables).
 */
async function drawCustom(doc: PDFKit.PDFDocument, x: number, y: number, c: CardData, ctx: CardContext) {
  doc.save();
  doc.roundedRect(x, y, W, H, 10).clip();
  doc.rect(x, y, W, H).fill("#FFFFFF");
  doc.image(ctx.background!, x, y, { cover: [W, H], align: "center", valign: "center" });
  doc.restore();

  const zx = x + ZONE.x * MM, zy = y + ZONE.y * MM, zw = ZONE.width * MM, zh = ZONE.height * MM;
  doc.save();
  doc.roundedRect(zx, zy, zw, zh, 8).fillOpacity(0.96).fill("#FFFFFF");
  doc.restore();
  doc.fillOpacity(1);
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(5.5).text("N.º DE PEREGRINO", zx, zy + 5, { width: zw, align: "center", lineBreak: false });
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text(formatParticipantNumber(c.number), zx, zy + 12, { width: zw, align: "center", lineBreak: false });
  if (c.name) doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(6.5).text(c.name, zx + 4, zy + 34, { width: zw - 8, height: 9, align: "center", lineBreak: false, ellipsis: true });
  const q = Math.min(zw - 24, zh - 50);
  doc.image(await qrPng(c.qrToken), zx + (zw - q) / 2, zy + zh - q - 6, { width: q, height: q });
}

async function drawCard(doc: PDFKit.PDFDocument, x: number, y: number, c: CardData, ctx: CardContext) {
  if (ctx.background) await drawCustom(doc, x, y, c, ctx);
  else await drawStandard(doc, x, y, c, ctx);
  // Borde de corte
  doc.roundedRect(x, y, W, H, 10).lineWidth(0.6).strokeColor("#C9D3DF").stroke();
}

/** Hoja A4 con 9 credenciales verticales (3 × 3), listas para imprimir y recortar. */
export async function buildCredentialsPdf(cards: CardData[], ctx: CardContext): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: `Credenciales · ${ctx.eventName}`, Author: ctx.parish } });
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const perPage = COLS * ROWS;
  const left = (595.28 - (COLS * W + (COLS - 1) * GAP)) / 2;
  const top = (841.89 - (ROWS * H + (ROWS - 1) * GAP)) / 2;
  for (let i = 0; i < cards.length; i++) {
    if (i > 0 && i % perPage === 0) doc.addPage();
    const slot = i % perPage;
    await drawCard(doc, left + (slot % COLS) * (W + GAP), top + Math.floor(slot / COLS) * (H + GAP), cards[i], ctx);
  }
  doc.end();
  return done;
}
