"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronRight, ScanLine, Wallet } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtTime, pad, startOfDayISO } from "@/lib/format";
import type { Checkin, Paged } from "@/lib/types";
import { useApp, useLive } from "@/components/AppContext";
import { Avatar, Loading, Page, StatusPill } from "@/components/ui";
import { EventPicker } from "@/components/Shell";

export default function Inicio() {
  const router = useRouter();
  const { me, can, event, pendingPayments } = useApp();
  const isOperatorOnly = !can("checkin:read");
  useEffect(() => { if (isOperatorOnly) router.replace("/registrar"); }, [isOperatorOnly, router]);

  const id = event?.id;
  const stats = useLoad(async () => {
    if (!id || isOperatorOnly) return null;
    const [today, recent] = await Promise.all([
      api<Paged<Checkin>>(`/events/${id}/checkins${qs({ status: "ACTIVE", from: startOfDayISO(0, event?.timezone), pageSize: 1 })}`),
      api<{ total: number; items: Checkin[] }>(`/events/${id}/checkins/recent`),
    ]);
    return { today: today.total, recent: recent.items, last: recent.items[0]?.timestamp ?? null };
  }, [id]);
  useLive((t) => { if (t.startsWith("checkin.")) stats.reload(); });

  if (isOperatorOnly) return <Loading />;
  return (
    <Page title="Inicio">
      <EventPicker />
      {!event ? <div className="empty">Todavía no hay eventos. Un superadministrador puede crearlo en Configuración.</div> : (
        <>
          <div className="row"><div><h2>{event.name}</h2><span className="muted">{event.parishName ?? ""}</span></div><StatusPill s={event.status} /></div>
          <div className="grid2">
            <div className="card stat"><span className="l">Personas registradas</span><span className="n">{event._count.participants.toLocaleString("es-AR")}</span></div>
            <div className="card stat"><span className="l">Puntos de control</span><span className="n">{event._count.checkpoints}</span></div>
            <div className="card stat"><span className="l">Llegadas de hoy</span><span className="n">{stats.data?.today ?? "—"}</span></div>
            <div className="card stat"><span className="l">Último registro</span><span className="n">{stats.data?.last ? fmtTime(stats.data.last, event.timezone) : "—"}</span></div>
          </div>
          {can("checkin:create") && <Link href="/registrar" className="btn btn-ok btn-xl"><ScanLine size={26} /> Registrar llegada</Link>}
          {can("payment:review") && pendingPayments > 0 && (
            <Link href="/pagos" className="card row" style={{ borderColor: "var(--warn)" }}>
              <span className="row" style={{ justifyContent: "flex-start" }}><Wallet color="#F29B18" /> <b>{pendingPayments} {pendingPayments === 1 ? "pago por revisar" : "pagos por revisar"}</b></span><ChevronRight className="chev" />
            </Link>
          )}
          <h3>Últimas llegadas</h3>
          <div className="card flat">
            {stats.loading ? <Loading /> : !stats.data?.recent.length ? <div className="empty">Aún no hay llegadas registradas.</div> :
              stats.data.recent.map((c) => (
                <div className="list-item" key={c.id} style={{ cursor: "default" }}>
                  <Avatar n={c.participant.number} />
                  <div className="grow"><div className="t">{pad(c.participant.number)} — {c.participant.firstName} {c.participant.lastName}</div><div className="s">{c.checkpoint.name} — {fmtTime(c.timestamp, event.timezone)}</div></div>
                </div>
              ))}
          </div>
        </>
      )}
    </Page>
  );
}
