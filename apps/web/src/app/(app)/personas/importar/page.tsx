"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet } from "lucide-react";
import { ApiError, download, upload } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Page } from "@/components/ui";

interface Summary { total: number; valid: number; invalid: number; duplicateDocuments: number; duplicateNumbers: number; issues: { row: number; field: string; message: string }[]; issuesTruncated: boolean; imported?: number }

export default function Importar() {
  const router = useRouter();
  const { event } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (mode: "preview" | "commit", f: File) => {
    const form = new FormData(); form.append("file", f);
    return upload<Summary>(`/events/${event!.id}/participants/import?mode=${mode}`, form);
  };
  async function pick(f: File | null) {
    setFile(f); setSum(null); setErr(null);
    if (!f || !event) return;
    setBusy(true);
    try { setSum(await send("preview", f)); } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo leer el archivo."); } finally { setBusy(false); }
  }
  async function commit() {
    if (!file) return; setBusy(true); setErr(null);
    try { setSum(await send("commit", file)); } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo importar."); } finally { setBusy(false); }
  }

  return (
    <Page title="Importar desde Excel" back="/personas">
      <div className="card stack">
        <p className="muted">Sube un archivo .xlsx con las columnas <b>Número, Nombre, Apellido, Documento, Teléfono</b>. «Número» es opcional. Antes de guardar verás un resumen.</p>
        <button className="btn" onClick={() => event && download(`/events/${event.id}/participants/import/template`, "plantilla-participantes.xlsx")}><Download size={20} /> Descargar plantilla</button>
        <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy}><FileSpreadsheet size={20} /> {file ? "Elegir otro archivo" : "Elegir archivo Excel"}</button>
        {file && <span className="muted">{file.name}</span>}
      </div>
      <ErrorBox msg={err} />
      {busy && <div className="spinner" />}
      {sum && sum.imported === undefined && (
        <div className="card stack">
          <h2>{sum.total} registros encontrados</h2>
          <div className="stack-sm">
            <div className="alert ok">{sum.valid} válidos</div>
            {sum.duplicateDocuments > 0 && <div className="alert warn">{sum.duplicateDocuments} con documento duplicado</div>}
            {sum.duplicateNumbers > 0 && <div className="alert warn">{sum.duplicateNumbers} con número duplicado</div>}
            {sum.invalid - sum.duplicateDocuments - sum.duplicateNumbers > 0 && <div className="alert err">Otras filas con datos faltantes o con formato incorrecto</div>}
          </div>
          {sum.issues.length > 0 && (
            <details><summary style={{ cursor: "pointer", fontWeight: 700 }}>Ver detalle de las filas con problemas</summary>
              <ul className="small" style={{ paddingLeft: 18 }}>{sum.issues.slice(0, 60).map((i, k) => <li key={k}>Fila {i.row} · {i.field}: {i.message}</li>)}</ul>
              {sum.issuesTruncated && <p className="muted">Se muestran solo las primeras.</p>}
            </details>
          )}
          <div className="btn-row"><button className="btn" onClick={() => pick(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy || sum.valid === 0} onClick={commit}>Importar {sum.valid} válidos</button></div>
        </div>
      )}
      {sum?.imported !== undefined && (
        <div className="card stack" style={{ textAlign: "center" }}>
          <CheckCircle2 size={56} color="#18A957" style={{ margin: "0 auto" }} />
          <h2>{sum.imported} personas importadas</h2>
          {sum.invalid > 0 && <p className="muted">{sum.invalid} filas no se importaron por tener problemas.</p>}
          <button className="btn btn-primary" onClick={() => router.push("/personas")}>Ver personas</button>
        </div>
      )}
    </Page>
  );
}
