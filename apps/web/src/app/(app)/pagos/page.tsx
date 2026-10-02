"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Copy, Link2, TriangleAlert } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDateTime, fmtDoc, money } from "@/lib/format";
import type { Paged, RegistrationRow, RegStatus } from "@/lib/types";
import { useApp, useLive } from "@/components/AppContext";
import { copyText, ErrorBox, Loading, Page, StatusPill } from "@/components/ui";

const TABS: [RegStatus, string][] = [["IN_REVIEW", "En revisión"], ["PENDING_PROOF", "Sin comprobante"], ["REJECTED", "Rechazadas"], ["APPROVED", "Confirmadas"]];

export default function Pagos() {
  const { event } = useApp();
  const eid = event?.id;
  const [tab, setTab] = useState<RegStatus>("IN_REVIEW");
  const [copied, setCopied] = useState(false);
  const list = useLoad(() => (eid ? api<Paged<RegistrationRow> & { counts: Record<string, number> }>(`/events/${eid}/registrations${qs({ status: tab, pageSize: 50 })}`) : Promise.resolve(null)), [eid, tab]);
  const link = useLoad(() => (eid ? api<{ open: boolean; url: string | null }>(`/events/${eid}/registrations/link`) : Promise.resolve(null)), [eid]);
  useLive((t) => { if (t.startsWith("registration.")) list.reload(); });
  const counts = list.data?.counts ?? {};

  return (
    <Page title="Pagos por revisar">
      <div className="card stack-sm">
        <div className="row"><b><Link2 size={18} style={{ verticalAlign: "-3px" }} /> Enlace de inscripción</b><span className={`pill ${link.data?.open ? "ok" : "gray"}`}>{link.data?.open ? "Abierta" : "Cerrada"}</span></div>
        {link.data?.url ? (<>
          <div className="copy-box">{`${typeof window !== "undefined" ? window.location.origin : ""}${new URL(link.data.url).pathname}`}</div>
          <button className="btn btn-sm" onClick={async () => { setCopied(await copyText(`${window.location.origin}${new URL(link.data!.url!).pathname}`)); setTimeout(() => setCopied(false), 2000); }}><Copy size={16} /> {copied ? "Copiado" : "Copiar enlace"}</button>
        </>) : <p className="muted">La inscripción está cerrada. Un superadministrador puede abrirla en Configuración → Evento.</p>}
      </div>

      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}{k === "IN_REVIEW" && counts.IN_REVIEW ? <span className="badge">{counts.IN_REVIEW}</span> : null}</button>)}</div>
      <ErrorBox msg={list.error} />
      <div className="card flat">
        {list.loading && !list.data ? <Loading /> : !list.data?.items.length ? <div className="empty">No hay inscripciones en este estado.</div> :
          list.data.items.map((r) => {
            const pr = r.proofs[0];
            return (
              <Link key={r.id} href={`/pagos/${r.id}`} className="list-item">
                <span className="grow">
                  <span className="t">{r.firstName} {r.lastName}</span>{" "}
                  {r.participant && <span className="pill ok">N.º {String(r.participant.number).padStart(3, "0")}</span>}
                  {pr?.duplicateOfOther && <span className="pill err" style={{ marginLeft: 6 }}><TriangleAlert size={12} style={{ verticalAlign: "-1px" }} /> comprobante repetido</span>}
                  <br /><span className="s">DNI {fmtDoc(r.documentNumber)} · {pr ? `${pr.amount ? money(pr.amount) + " · " : ""}${fmtDateTime(pr.createdAt, event?.timezone)}` : "esperando comprobante"}</span>
                </span>
                <StatusPill s={r.status} /><ChevronRight className="chev" />
              </Link>
            );
          })}
      </div>
    </Page>
  );
}
