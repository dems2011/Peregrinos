"use client";
import { useState } from "react";
import { Download, QrCode } from "lucide-react";
import { api, ApiError, download } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useApp, useLive } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";

export default function Credenciales() {
  const { event } = useApp();
  const eid = event?.id;
  const st = useLoad(() => (eid ? api<{ total: number; pendingPrint: number; printed: number; pageSize: number }>(`/events/${eid}/credentials/status`) : Promise.resolve(null)), [eid]);
  useLive((t) => { if (t === "participants.changed") st.reload(); });
  const [scope, setScope] = useState<"new" | "all">("new");
  const [includeName, setIncludeName] = useState(false);
  const [mark, setMark] = useState(true);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const s = st.data;
  const count = s ? (scope === "new" ? s.pendingPrint : s.total) : 0;
  const pages = s ? Math.max(1, Math.ceil(count / s.pageSize)) : 1;

  async function go() {
    setBusy(true); setErr(null);
    try {
      await download(`/events/${eid}/credentials?scope=${scope}&includeName=${includeName}&mark=${mark && scope === "new"}&page=${page}`, `credenciales-lote${page}.pdf`);
      st.reload();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo generar el PDF."); } finally { setBusy(false); }
  }

  return (
    <Page title="Credenciales">
      {st.loading && !s ? <Loading /> : (
        <>
          <div className="grid2">
            <div className="card stat"><span className="l">Por imprimir</span><span className="n">{s?.pendingPrint ?? 0}</span></div>
            <div className="card stat"><span className="l">Ya impresas</span><span className="n">{s?.printed ?? 0}</span></div>
          </div>
          <div className="card stack">
            <h2>Vista previa del carnet</h2>
            <div className="carnet" aria-hidden="true">
              <div className="head"><b>{event?.parishName ?? "Nombre de la parroquia"}</b><span>{event?.name}</span></div>
              <div className="num"><small>N.º DE PEREGRINO</small><b>001</b></div>
              <div className="qr"><QrCode size="70%" /></div>
            </div>
            <p className="muted" style={{ textAlign: "center" }}>Tamaño tarjeta (85,6 × 54 mm) · 10 por hoja A4 · el QR solo contiene un identificador seguro.</p>
          </div>
          <div className="card stack">
            <h2>Exportar para imprimir</h2>
            <ErrorBox msg={err} />
            <div className="tabs"><button className={`tab ${scope === "new" ? "on" : ""}`} onClick={() => { setScope("new"); setPage(1); setMark(true); }}>Solo las nuevas</button><button className={`tab ${scope === "all" ? "on" : ""}`} onClick={() => { setScope("all"); setPage(1); }}>Todas</button></div>
            <label className="check"><input type="checkbox" checked={includeName} onChange={(e) => setIncludeName(e.target.checked)} /> Imprimir también el nombre</label>
            {scope === "new" && <label className="check"><input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} /> Marcar como impresas al exportar</label>}
            {pages > 1 && <div className="field" style={{ marginBottom: 0 }}><label htmlFor="pg">Lote (de {s?.pageSize} credenciales)</label><select id="pg" value={page} onChange={(e) => setPage(Number(e.target.value))}>{Array.from({ length: pages }, (_, i) => <option key={i} value={i + 1}>Lote {i + 1} de {pages}</option>)}</select></div>}
            <button className="btn btn-primary btn-xl" disabled={busy || count === 0} onClick={go}><Download size={24} /> {busy ? "Generando PDF…" : `Descargar PDF (${count})`}</button>
            {count === 0 && <p className="muted">No hay credenciales para exportar con esta opción.</p>}
          </div>
        </>
      )}
    </Page>
  );
}
