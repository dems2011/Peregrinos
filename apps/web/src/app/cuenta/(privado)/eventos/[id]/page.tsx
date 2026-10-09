"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { EventChat } from "@/components/EventChat";
import { useAccount } from "@/components/account/AccountContext";

/** B1 — Chat del evento para el peregrino inscrito (con su cuenta). Aislado por evento. */
interface MyEvent { id: string; name: string; timezone: string; organization: { name: string }; chat: boolean }

export default function ChatPeregrino() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAccount();
  const list = useLoad(() => api<{ items: MyEvent[] }>("/auth/account/events"), []);
  const e = list.data?.items.find((x) => x.id === id);
  if (!list.data) return <div className="acct-loading">Cargando…</div>;
  if (!e || !e.chat) return (
    <section className="card stack-sm"><div className="alert warn">Este chat es solo para las personas inscritas en el evento.</div><Link className="btn" href="/cuenta/eventos">Mis eventos</Link></section>
  );
  return (
    <section className="card stack-sm">
      <div><Link href="/cuenta/eventos" className="small">← Mis eventos</Link></div>
      <h2 style={{ overflowWrap: "anywhere" }}>{e.name}</h2>
      <p className="muted small" style={{ margin: 0 }}>Chat con {e.organization.name} y las demás personas inscritas en este evento.</p>
      <EventChat base={`/auth/account/events/${e.id}/chat`} timezone={e.timezone} viewerId={me.user.id} />
    </section>
  );
}
