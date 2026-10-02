"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, FileUp, Plus, Search } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useDebounced, useLoad } from "@/lib/hooks";
import { fmtDoc } from "@/lib/format";
import type { Paged, Person } from "@/lib/types";
import { useApp, useLive } from "@/components/AppContext";
import { Avatar, ErrorBox, Loading, Page, StatusPill } from "@/components/ui";

export default function Personas() {
  const { event, can } = useApp();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [pages, setPages] = useState(1);
  useEffect(() => setPages(1), [dq, event?.id]);

  const list = useLoad(async () => {
    if (!event) return null;
    return api<Paged<Person>>(`/events/${event.id}/participants${qs({ q: dq, page: 1, pageSize: 25 * pages })}`);
  }, [event?.id, dq, pages]);
  useLive((t) => { if (t === "participants.changed") list.reload(); });
  const d = list.data;

  return (
    <Page title="Base de datos de personas" action={can("participant:create") ? <Link href="/personas/nueva" className="ic" aria-label="Agregar persona"><Plus size={24} /></Link> : undefined}>
      <div className="search"><Search size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, apellido, número o documento…" aria-label="Buscar" inputMode="search" /></div>
      <div className="btn-row">
        {can("participant:create") && <Link href="/personas/nueva" className="btn btn-primary"><Plus size={20} /> Agregar persona</Link>}
        {can("participant:manage") && <Link href="/personas/importar" className="btn"><FileUp size={20} /> Importar Excel</Link>}
      </div>
      <ErrorBox msg={list.error} />
      <div className="card flat">
        {list.loading && !d ? <Loading /> : !d?.items.length ? <div className="empty">{dq ? "No se encontró a nadie con esa búsqueda." : "Aún no hay personas cargadas."}</div> :
          d.items.map((p) => (
            <Link key={p.id} href={`/personas/${p.id}`} className="list-item">
              <Avatar n={p.number} />
              <div className="grow">
                <div className="t">{p.firstName} {p.lastName} {p.status !== "ACTIVE" && <StatusPill s={p.status} />}</div>
                <div className="s">{p.phone ? `${p.phone} · ` : ""}DNI {fmtDoc(p.documentNumber)}</div>
              </div>
              <ChevronRight className="chev" />
            </Link>
          ))}
      </div>
      {d && d.total > d.items.length && <button className="btn" onClick={() => setPages((p) => p + 1)}>Cargar más ({d.items.length} de {d.total})</button>}
      <p className="muted">Total de personas: {d?.total ?? "—"}</p>
    </Page>
  );
}
