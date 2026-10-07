"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Eye, Trash2, Upload } from "lucide-react";
import { CREDENTIAL_SPEC } from "@peregrinos/shared";
import { ApiError, api, del, download, patch, upload } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";

/**
 * B1 — Diseño de la credencial del evento (SIEMPRE vertical): estándar de Peregrinos o fondo propio de la parroquia.
 * El fondo se valida en el servidor (tipo, peso, medidas y proporción) y nunca se deforma.
 */
interface Design { mode: "STANDARD" | "CUSTOM"; background: { width: number; height: number; sizeBytes: number; mime: string; createdAt: string } | null }
const S = CREDENTIAL_SPEC;

export default function CredencialDiseno() {
  const { event, can, reloadEvents } = useApp();
  const eid = event?.id;
  const d = useLoad(() => (eid ? api<Design>(`/events/${eid}/credentials/design`) : Promise.resolve(null)), [eid]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const editable = can("event:update");

  if (!event) return <Page title="Credenciales" back="/evento"><div className="empty">No hay un evento seleccionado.</div></Page>;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setErr(null); setOk(null);
    try { await fn(); setOk(done); await d.reload(); await reloadEvents(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo completar."); } finally { setBusy(false); }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > S.maxBytes) { setErr(`El archivo pesa ${(f.size / 1048576).toFixed(1)} MB; el máximo es ${S.maxBytes / 1048576} MB.`); return; }
    const form = new FormData(); form.append("file", f);
    await run(() => upload(`/events/${eid}/credentials/background`, form, "PUT"), "Diseño subido. Elige «Diseño propio» para usarlo.");
    if (file.current) file.current.value = "";
  };
  const data = d.data;

  return (
    <Page title="Diseño de la credencial" back="/evento">
      <ErrorBox msg={err ?? d.error} />
      {ok && <div className="alert ok" role="status">{ok}</div>}
      {d.loading && !data ? <Loading /> : data && <>
        <section className="card stack-sm">
          <h2>Diseño en uso</h2>
          <label className="check"><input type="radio" name="mode" checked={data.mode === "STANDARD"} disabled={!editable || busy} onChange={() => void run(() => patch(`/events/${eid}`, { credentialMode: "STANDARD" }), "Se usará el diseño estándar de Peregrinos.")} /> Diseño estándar de Peregrinos</label>
          <label className="check"><input type="radio" name="mode" checked={data.mode === "CUSTOM"} disabled={!editable || busy || !data.background} onChange={() => void run(() => patch(`/events/${eid}`, { credentialMode: "CUSTOM" }), "Se usará el diseño propio de la parroquia.")} /> Diseño propio de la parroquia{!data.background && <span className="muted"> (primero súbelo)</span>}</label>
          <div className="btn-row">
            <button className="btn" disabled={busy} onClick={() => void download(`/events/${eid}/credentials/preview?mode=STANDARD`, "vista-previa-estandar.pdf")}><Eye size={18} /> Ver estándar</button>
            {data.background && <button className="btn" disabled={busy} onClick={() => void download(`/events/${eid}/credentials/preview?mode=CUSTOM`, "vista-previa-propia.pdf")}><Eye size={18} /> Ver propio</button>}
          </div>
          <Link className="btn btn-primary" href="/credenciales">Exportar credenciales para imprimir</Link>
        </section>

        <section className="card stack-sm">
          <h2>Diseño propio</h2>
          {data.background
            ? <p className="small">Subido: {data.background.width} × {data.background.height} px · {(data.background.sizeBytes / 1048576).toFixed(2)} MB · {data.background.mime.replace("image/", "").toUpperCase()}</p>
            : <p className="muted small">Todavía no subiste un diseño propio.</p>}
          <div className="alert info small">
            <b>Requisitos</b> (se validan automáticamente):<br />
            • Siempre <b>vertical</b>, tamaño tarjeta {S.widthMm} × {S.heightMm} mm (proporción {S.ratio.toFixed(3)}, tolerancia ±{S.ratioTolerance * 100} %).<br />
            • Recomendado: <b>{S.recommendedPx.width} × {S.recommendedPx.height} px</b> (600 ppp). Mínimo {S.minPx.width} × {S.minPx.height} px (300 ppp).<br />
            • Formato PNG o JPEG, hasta {S.maxBytes / 1048576} MB.<br />
            • <b>Zona segura</b>: Peregrinos coloca un panel blanco con el número, el QR y el nombre desde {S.dataZoneMm.y} mm del borde superior hasta el pie ({S.dataZoneMm.x} mm de margen a los lados). Pon el logo y el arte importante en la parte superior.<br />
            • La imagen cubre toda la tarjeta sin deformarse; lo que exceda la proporción se recorta.
          </div>
          {editable && <>
            <input ref={file} type="file" accept="image/png,image/jpeg" className="sr-only" id="bgfile" onChange={(e) => void onFile(e.target.files?.[0])} />
            <div className="btn-row">
              <label htmlFor="bgfile" className="btn btn-primary" aria-disabled={busy}><Upload size={18} /> {data.background ? "Reemplazar diseño" : "Subir diseño"}</label>
              {data.background && <button className="btn" disabled={busy} onClick={() => void run(() => del(`/events/${eid}/credentials/background`), "Diseño propio eliminado: se usa el estándar.")}><Trash2 size={18} /> Quitar</button>}
            </div>
          </>}
        </section>
      </>}
    </Page>
  );
}
