import ExcelJS from "exceljs";
import { digitsOnly, normalizeDocument } from "@peregrinos/shared";

export const MAX_IMPORT_ROWS = 5000;

export interface ParsedRow {
  row: number; // número de fila en el Excel (1 = encabezado)
  number?: number;
  firstName: string;
  lastName: string;
  documentNumber: string; // normalizado
  phone: string;
}
export interface RowIssue { row: number; field: string; code: string; message: string }

const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADERS: Record<string, keyof Omit<ParsedRow, "row">> = {
  numero: "number", nro: "number", n: "number", num: "number",
  nombre: "firstName", nombres: "firstName",
  apellido: "lastName", apellidos: "lastName",
  documento: "documentNumber", dni: "documentNumber", doc: "documentNumber",
  telefono: "phone", celular: "phone", tel: "phone",
};

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return String(v.result ?? "").trim();
    if ("text" in v) return String(v.text ?? "").trim();
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

export class ImportFormatError extends Error {}

export async function parseWorkbook(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new ImportFormatError("El archivo no es un Excel (.xlsx) válido.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ImportFormatError("El archivo no tiene hojas.");

  const cols = new Map<number, keyof Omit<ParsedRow, "row">>();
  ws.getRow(1).eachCell((cell, col) => {
    const key = HEADERS[strip(cellText(cell.value))];
    if (key) cols.set(col, key);
  });
  const found = new Set(cols.values());
  const missing = (["firstName", "lastName", "documentNumber", "phone"] as const).filter((k) => !found.has(k));
  if (missing.length) {
    const names = { firstName: "Nombre", lastName: "Apellido", documentNumber: "Documento", phone: "Teléfono" } as const;
    throw new ImportFormatError(`Faltan columnas en la primera fila: ${missing.map((m) => names[m]).join(", ")}.`);
  }

  const rawRows: { row: number; data: Partial<Record<keyof Omit<ParsedRow, "row">, string>> }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const data: Partial<Record<keyof Omit<ParsedRow, "row">, string>> = {};
    cols.forEach((key, col) => { data[key] = cellText(row.getCell(col).value); });
    if (Object.values(data).every((v) => !v)) return; // fila vacía
    rawRows.push({ row: rowNumber, data });
  });
  if (rawRows.length === 0) throw new ImportFormatError("El archivo no tiene filas de datos.");
  if (rawRows.length > MAX_IMPORT_ROWS) throw new ImportFormatError(`Máximo ${MAX_IMPORT_ROWS} filas por importación.`);
  return rawRows;
}

export interface ValidationResult {
  valid: ParsedRow[];
  issues: RowIssue[];
  total: number;
  invalidRows: number;
  duplicateDocuments: number;
  duplicateNumbers: number;
}

/** Valida campos obligatorios, formatos y duplicados (dentro del archivo y contra la base del evento). */
export function validateRows(
  rows: { row: number; data: Partial<Record<keyof Omit<ParsedRow, "row">, string>> }[],
  existingNumbers: Set<number>,
  existingDocs: Set<string>,
): ValidationResult {
  const issues: RowIssue[] = [];
  const seenNumbers = new Map<number, number>();
  const seenDocs = new Map<string, number>();
  const valid: ParsedRow[] = [];
  const bad = new Set<number>(), dupDoc = new Set<number>(), dupNum = new Set<number>();
  const add = (row: number, field: string, code: string, message: string) => { issues.push({ row, field, code, message }); bad.add(row); };

  for (const { row, data } of rows) {
    const firstName = (data.firstName ?? "").trim();
    const lastName = (data.lastName ?? "").trim();
    const documentNumber = normalizeDocument(data.documentNumber ?? "");
    const phone = (data.phone ?? "").trim();
    const numRaw = (data.number ?? "").trim();
    let number: number | undefined;
    const before = issues.length;

    if (!firstName) add(row, "Nombre", "REQUIRED", "Falta el nombre");
    if (!lastName) add(row, "Apellido", "REQUIRED", "Falta el apellido");
    if (!documentNumber) add(row, "Documento", "REQUIRED", "Falta el documento");
    else if (documentNumber.length < 5 || documentNumber.length > 20) add(row, "Documento", "FORMAT", "Documento no válido");
    if (!phone) add(row, "Teléfono", "REQUIRED", "Falta el teléfono");
    else if (digitsOnly(phone).length < 7 || digitsOnly(phone).length > 15) add(row, "Teléfono", "FORMAT", "Teléfono no válido");
    if (numRaw) {
      if (!/^\d{1,6}$/.test(numRaw) || Number(numRaw) < 1) add(row, "Número", "FORMAT", "El número debe ser un entero positivo");
      else number = Number(numRaw);
    }

    if (number !== undefined) {
      if (existingNumbers.has(number)) { add(row, "Número", "DUPLICATE_NUMBER", `El número ${number} ya existe en el evento`); dupNum.add(row); }
      else if (seenNumbers.has(number)) { add(row, "Número", "DUPLICATE_NUMBER", `El número ${number} está repetido (fila ${seenNumbers.get(number)})`); dupNum.add(row); }
      else seenNumbers.set(number, row);
    }
    if (documentNumber.length >= 5) {
      if (existingDocs.has(documentNumber)) { add(row, "Documento", "DUPLICATE_DOCUMENT", "El documento ya existe en el evento"); dupDoc.add(row); }
      else if (seenDocs.has(documentNumber)) { add(row, "Documento", "DUPLICATE_DOCUMENT", `Documento repetido (fila ${seenDocs.get(documentNumber)})`); dupDoc.add(row); }
      else seenDocs.set(documentNumber, row);
    }
    if (issues.length === before) valid.push({ row, number, firstName, lastName, documentNumber, phone });
  }
  return { valid, issues, total: rows.length, invalidRows: bad.size, duplicateDocuments: dupDoc.size, duplicateNumbers: dupNum.size };
}

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Participantes");
  ws.columns = [
    { header: "Número", key: "n", width: 10 }, { header: "Nombre", key: "a", width: 20 },
    { header: "Apellido", key: "b", width: 20 }, { header: "Documento", key: "c", width: 16 },
    { header: "Teléfono", key: "d", width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ n: 101, a: "Ejemplo", b: "Apellido", c: "30123456", d: "+54 9 11 1234 5678" });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
