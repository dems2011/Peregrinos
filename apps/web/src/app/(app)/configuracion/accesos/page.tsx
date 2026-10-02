"use client";
import { useState } from "react";
import { Download, KeyRound } from "lucide-react";
import { api, ApiError, download } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";

export default function Accesos() {
  const { event } = useApp();
  const eid = event?.id;
  const st = useLoad(() => (eid ? api<{ total: number; withAccess: number; without: number }>(`/events/${eid}/access/status`) : Promise.resolve(null)), [eid]);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const issue = async (reissue: boolean) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await download(`/events/${eid}/access/issue?format=csv`, "acceso-peregrinos.csv", { method: "POST", body: JSON.stringify({ reissue }) });
      setMsg("Listo: se descargó el archivo con los enlaces y códigos. Guárdalo en un lugar seguro; no se podrá volver a generar el mismo."); st.reload();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo emitir."); } finally { setBusy(false); }
  };
  return (
    <Page title="Acceso de peregrinos" back="/configuracion">
      <p className="muted">Cada peregrino entra a su app con un enlace personal o un código corto. Por seguridad solo se muestran al emitirlos: se descargan en un archivo (para enviarlos por WhatsApp/correo o imprimirlos en la credencial).</p>
      {st.loading ? <Loading /> : st.data && (
        <div className="grid2"><div className="card stat"><span className="l">Con acceso</span><span className="n">{st.data.withAccess}</span></div><div className="card stat"><span className="l">Sin acceso</span><span className="n">{st.data.without}</span></div></div>
      )}
      <ErrorBox msg={err} />{msg && <div className="alert ok">{msg}</div>}
      <button className="btn btn-primary btn-xl" disabled={busy || st.data?.without === 0} onClick={() => issue(false)}><Download size={24} /> Emitir a quienes faltan (CSV)</button>
      <div className="card stack-sm">
        <h3><KeyRound size={18} style={{ verticalAlign: "-3px" }} /> Reemitir a todos</h3>
        <p className="muted">Genera enlaces nuevos para todos. Los anteriores y las sesiones abiertas dejan de funcionar. Úsalo solo si hubo una filtración.</p>
        <button className="btn btn-danger" disabled={busy} onClick={() => { if (confirm("Todos los enlaces actuales dejarán de funcionar. ¿Continuar?")) issue(true); }}>Reemitir a todos</button>
      </div>
    </Page>
  );
}
