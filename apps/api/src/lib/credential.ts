import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { formatParticipantNumber, qrContent } from "@peregrinos/shared";

export interface CardData {
  number: number;
  qrToken: string;
  /** Solo se imprime si se pide (por defecto la credencial no lleva datos personales). */
  name?: string;
}

// Tamaño CR80 (tarjeta estándar 85,6 × 54 mm) en puntos PDF.
const W = 242.6, H = 153.1, GAP = 6, COLS = 2, ROWS = 5;
const NAVY = "#0B3158", BLUE = "#1677FF", TEXT = "#17324D", MUTED = "#6D7D8E", LINE = "#E2E8EF";

async function drawCard(doc: PDFKit.PDFDocument, x: number, y: number, c: CardData, parish: string, eventName: string) {
  // Fondo y cabecera (recortados con las esquinas redondeadas)
  doc.save();
  doc.roundedRect(x, y, W, H, 10).clip();
  doc.rect(x, y, W, H).fill("#FFFFFF");
  doc.rect(x, y, W, 46).fill(NAVY);
  doc.rect(x, y + 46, W, 3).fill(BLUE);
  doc.restore();

  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(12.5)
    .text(parish, x + 14, y + 10, { width: W - 28, height: 16, lineBreak: false, ellipsis: true });
  doc.fillColor("#BFD4EE").font("Helvetica").fontSize(8)
    .text(eventName, x + 14, y + 29, { width: W - 28, height: 10, lineBreak: false, ellipsis: true });

  // Número asignado, grande
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("N.º DE PEREGRINO", x + 14, y + 62, { lineBreak: false });
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(48).text(formatParticipantNumber(c.number), x + 12, y + 72, { lineBreak: false });
  if (c.name) {
    doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(8.5)
      .text(c.name, x + 14, y + 124, { width: 116, height: 11, lineBreak: false, ellipsis: true });
  }
  doc.fillColor(MUTED).font("Helvetica").fontSize(6.5)
    .text("Presenta esta credencial en cada punto de control", x + 14, y + 138, { width: 118, height: 10, lineBreak: false, ellipsis: true });

  // QR (solo contiene "PG1:<token>", sin datos personales)
  const qr = await QRCode.toBuffer(qrContent(c.qrToken), { type: "png", width: 360, margin: 1, errorCorrectionLevel: "M" });
  const q = 82, qx = x + W - q - 16, qy = y + 58;
  doc.roundedRect(qx - 5, qy - 5, q + 10, q + 10, 7).lineWidth(0.8).fillAndStroke("#FFFFFF", LINE);
  doc.image(qr, qx, qy, { width: q, height: q });
  doc.fillColor(MUTED).font("Helvetica").fontSize(6).text("Escanéame", qx - 5, qy + q + 8, { width: q + 10, align: "center", lineBreak: false });

  // Borde de corte
  doc.roundedRect(x, y, W, H, 10).lineWidth(0.6).strokeColor("#C9D3DF").stroke();
}

/** Hoja A4 con 10 credenciales (2 × 5), listas para imprimir y recortar. */
export async function buildCredentialsPdf(cards: CardData[], parish: string, eventName: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: `Credenciales · ${eventName}`, Author: parish } });
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const perPage = COLS * ROWS;
  const left = (595.28 - (COLS * W + (COLS - 1) * GAP)) / 2;
  const top = (841.89 - (ROWS * H + (ROWS - 1) * GAP)) / 2;
  for (let i = 0; i < cards.length; i++) {
    if (i > 0 && i % perPage === 0) doc.addPage();
    const slot = i % perPage;
    await drawCard(doc, left + (slot % COLS) * (W + GAP), top + Math.floor(slot / COLS) * (H + GAP), cards[i], parish, eventName);
  }
  doc.end();
  return done;
}
