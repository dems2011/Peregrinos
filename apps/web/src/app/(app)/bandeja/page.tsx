"use client";
import Link from "next/link";
import { api, post } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDateTimeMedium } from "@/lib/format";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";

interface Item { id: string; kind: string; title: string; body: string; createdAt: string; urgent: boolean; readAt: string | null }

/** Bandeja de avisos del personal: avisos de la parroquia y de SIGyP dirigidos al personal, y turnos para decidir. */
export default function Bandeja() {
  const { reloadCounters } = useApp();
  const inbox = useLoad(() => api<{ unread: number; items: Item[] }>("/staff/notifications"), []);
  const tz: string | undefined = undefined; // zona por defecto de la organización (DEFAULT_TIMEZONE)
  const read = async (id: string) => { await post(`/staff/notifications/${id}/read`).catch(() => undefined); await inbox.reload(); await reloadCounters(); };
  const readAll = async () => { await post("/staff/notifications/read-all").catch(() => undefined); await inbox.reload(); await reloadCounters(); };
  return (
    <Page title="Mis avisos" action={inbox.data && inbox.data.unread > 0 ? <button type="button" className="btn btn-sm" onClick={() => void readAll()}>Marcar todo como leído</button> : undefined}>
      <ErrorBox msg={inbox.error} />
      {!inbox.data ? !inbox.error && <Loading /> : inbox.data.items.length === 0 ? <p className="muted">No tienes avisos.</p> : (
        <div className="stack-sm">
          {inbox.data.items.map((n) => (
            <section key={n.id} className={`card stack-xs${n.readAt ? "" : " unread"}`} data-testid="staff-notice">
              <div><b>{!n.readAt && "● "}{n.title}</b> <span className="muted small">{fmtDateTimeMedium(n.createdAt, tz)}</span></div>
              <div className="small">{n.body}</div>
              <div className="btn-row">
                {n.kind === "TURN_REQUEST" && <Link className="btn btn-sm btn-primary" href="/turnos" onClick={() => void read(n.id)}>Ver turnos</Link>}
                {!n.readAt && <button type="button" className="btn btn-sm" onClick={() => void read(n.id)}>Marcar como leído</button>}
              </div>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
