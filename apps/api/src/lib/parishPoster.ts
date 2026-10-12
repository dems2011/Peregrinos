import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { ParishPosterSize } from "@peregrinos/shared";
import { cfg } from "../config";

/**
 * B4 — Cartel institucional de la parroquia, listo para imprimir en A4 o A3 (vertical): marca de Peregrinos, logo y
 * nombre de la parroquia, QR al perfil EXACTO de la parroquia (por su código), el código para dictarlo y la dirección
 * web legible. No lleva QR de descarga de la app: todavía no hay una publicación oficial (ver docs/PARROQUIAS-CODIGO-QR.md).
 */
export interface PosterData {
  name: string;
  code: string;
  address: string | null;
  /** Logo PNG/JPEG (pdfkit no dibuja WEBP: en ese caso se usa la inicial, como en la web). */
  logo: { data: Buffer; mime: string } | null;
}

const NAVY = "#0B3158", BLUE = "#1677FF", TEXT = "#17324D", MUTED = "#6D7D8E", LINE = "#E2E8EF";
/** Puntos PDF de cada tamaño (vertical). */
const PAGE: Record<ParishPosterSize, [number, number]> = { A4: [595.28, 841.89], A3: [841.89, 1190.55] };

/** Iglesia de la marca (Lucide Church, rejilla 24): la misma del icono de la app, con la puerta sin relleno. */
const CHURCH = [
  "M14,22 v-4 a2,2 0 0,0 -4,0 v4 z",
  "M10,9 h4",
  "M12,7 v5",
  "M18,22 V5.618 a1,1 0 0,0 -0.553,-0.894 l-4.553,-2.277 a2,2 0 0,0 -1.788,0 L6.553,4.724 A1,1 0 0,0 6,5.618 V22",
  "M18,7 l3.447,1.724 a1,1 0 0,1 0.553,0.894 V20 a2,2 0 0,1 -2,2 H4 a2,2 0 0,1 -2,-2 V9.618 a1,1 0 0,1 0.553,-0.894 L6,7",
];

/** Enlace del QR y de la dirección legible: el buscador resuelve el código y abre el perfil de esa parroquia. */
export const parishCodeUrl = (code: string) => `${cfg.WEB_ORIGIN.replace(/\/+$/, "")}/parroquias?codigo=${encodeURIComponent(code)}`;

export async function buildParishPosterPdf(p: PosterData, size: ParishPosterSize): Promise<Buffer> {
  const [W, H] = PAGE[size];
  const s = W / PAGE.A4[0]; // todo se diseña en A4 y se escala
  const doc = new PDFDocument({ size, margin: 0, info: { Title: `Cartel · ${p.name}`, Author: "Peregrinos", Subject: p.code } });
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const center = (text: string, y: number, font: string, pt: number, color: string, opts: PDFKit.Mixins.TextOptions = {}) =>
    doc.fillColor(color).font(font).fontSize(pt * s).text(text, 48 * s, y * s, { width: W - 96 * s, align: "center", ...opts });

  // Cabecera con la marca.
  doc.rect(0, 0, W, 132 * s).fill(NAVY);
  doc.rect(0, 132 * s, W, 5 * s).fill(BLUE);
  const icon = 46 * s, ix = W / 2 - icon / 2, iy = 20 * s;
  doc.save().translate(ix, iy).scale(icon / 24).lineWidth(2).lineCap("round").lineJoin("round").strokeColor("#FFFFFF");
  for (const d of CHURCH) doc.path(d).stroke();
  doc.restore();
  center("Peregrinos", 74, "Helvetica-Bold", 24, "#FFFFFF", { lineBreak: false });
  center("La Iglesia más cerca de ti", 104, "Helvetica", 11, "#BFD4EE", { lineBreak: false });

  // Parroquia: logo (o inicial), nombre y dirección.
  const lr = 44 * s, lcx = W / 2, lcy = 196 * s;
  const logoOk = p.logo && (p.logo.mime === "image/png" || p.logo.mime === "image/jpeg");
  doc.save().circle(lcx, lcy, lr).clip();
  if (logoOk) doc.image(p.logo!.data, lcx - lr, lcy - lr, { cover: [lr * 2, lr * 2], align: "center", valign: "center" });
  else {
    doc.rect(lcx - lr, lcy - lr, lr * 2, lr * 2).fill("#E8F1FF");
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(38 * s).text(p.name.charAt(0).toUpperCase(), lcx - lr, lcy - 19 * s, { width: lr * 2, align: "center", lineBreak: false });
  }
  doc.restore();
  doc.circle(lcx, lcy, lr).lineWidth(1.2 * s).strokeColor(LINE).stroke();

  center(p.name, 254, "Helvetica-Bold", 25, NAVY, { height: 64 * s, ellipsis: true });
  if (p.address) center(p.address, 322, "Helvetica", 11.5, MUTED, { height: 30 * s, ellipsis: true });
  center("Sigue las actividades, avisos y eventos de nuestra parroquia", 356, "Helvetica-Bold", 13, TEXT, { lineBreak: false, ellipsis: true });

  // QR al perfil de la parroquia.
  const q = 232 * s, qx = (W - q) / 2, qy = 386 * s;
  const qr = await QRCode.toBuffer(parishCodeUrl(p.code), { type: "png", width: 900, margin: 1, errorCorrectionLevel: "Q" });
  doc.roundedRect(qx - 12 * s, qy - 12 * s, q + 24 * s, q + 24 * s, 14 * s).lineWidth(1.2 * s).fillAndStroke("#FFFFFF", LINE);
  doc.image(qr, qx, qy, { width: q, height: q });
  center("Escanea el código con la cámara de tu teléfono", qy / s + 254, "Helvetica", 11, MUTED, { lineBreak: false });

  // Código para dictar y dirección web legible.
  const by = 668 * s, bw = 300 * s, bx = (W - bw) / 2;
  doc.roundedRect(bx, by, bw, 74 * s, 12 * s).fill("#E8F1FF");
  center("CÓDIGO DE LA PARROQUIA", 680, "Helvetica-Bold", 9.5, MUTED, { lineBreak: false });
  center(p.code, 696, "Helvetica-Bold", 30, NAVY, { lineBreak: false, characterSpacing: 2 * s });
  const host = cfg.WEB_ORIGIN.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  center(`O entra en ${host}/parroquias e ingresa el código`, 758, "Helvetica", 11, TEXT, { lineBreak: false, ellipsis: true });

  // Pie.
  doc.rect(0, H - 34 * s, W, 34 * s).fill(NAVY);
  doc.fillColor("#BFD4EE").font("Helvetica").fontSize(9 * s)
    .text("Peregrinos · La red que conecta a la Iglesia con su comunidad", 0, H - 22 * s, { width: W, align: "center", lineBreak: false });

  doc.end();
  return done;
}
