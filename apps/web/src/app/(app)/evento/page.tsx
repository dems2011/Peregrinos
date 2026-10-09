"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { EVENT_STATUS_LABEL, EVENT_TYPE_INFO, REGISTRATION_STATE_LABEL, hasEventCapability } from "@peregrinos/shared";
import { useApp } from "@/components/AppContext";
import { NewEventModal } from "@/components/NewEventModal";
import { EVENT_SECTIONS, sectionAllowed, sectionLabel } from "@/components/sections";
import { EventPicker, useNav } from "@/components/Shell";
import { Page, StatusPill } from "@/components/ui";
import { fmtDateTimeMedium } from "@/lib/format";

/**
 * B1 — Todo lo del evento activo en un solo lugar: inscripciones, formulario, recorrido y puntos, llegadas, credenciales,
 * voluntarios, chat, informe, contactos, accesos y datos del evento. Cada evento es independiente: cambiar de evento
 * cambia todas las secciones. Las secciones que ya están en el menú principal del rol no se repiten aquí.
 */
export default function EventoHub() {
  const router = useRouter();
  const { event, can, reloadEvents, setEventId } = useApp();
  const inNav = new Set(useNav().map((n) => n.href));
  const [creating, setCreating] = useState(false);
  const tiles = EVENT_SECTIONS.filter((s) => !inNav.has(s.href) && sectionAllowed(s, can, event));

  // «Crear evento» crea uno NUEVO (borrador) y lo deja como activo; editar el activo es «Datos del evento».
  const create = can("event:create") && (
    <button type="button" onClick={() => setCreating(true)}>
      <span className="tile" style={{ background: "#18A957" }}><CalendarPlus size={22} /></span>
      <b>Crear evento</b><span className="s">Nuevo evento en borrador (no modifica el activo)</span>
    </button>
  );
  const modal = creating && (
    <NewEventModal onClose={() => setCreating(false)} onCreated={async (id) => { await reloadEvents(); setEventId(id); setCreating(false); router.push("/configuracion/evento"); }} />
  );

  if (!event) return (
    <Page title="Evento">
      <div className="empty">No hay un evento seleccionado.{can("event:create") ? " Crea el primero con «Crear evento»." : ""}</div>
      {create && <nav className="hub" aria-label="Secciones del evento">{create}</nav>}
      {modal}
    </Page>
  );
  return (
    <Page title="Evento">
      <div className="only-mobile"><EventPicker /></div>
      <section className="card stack-sm">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <span className="pill">{EVENT_TYPE_INFO[event.type]?.label ?? event.type}</span>
            <h2 style={{ margin: "6px 0 2px", overflowWrap: "anywhere" }}>{event.name}</h2>
            <div className="muted small">{fmtDateTimeMedium(event.startsAt, event.timezone)}</div>
          </div>
          <StatusPill s={event.status} />
        </div>
        <div className="muted small">
          {EVENT_STATUS_LABEL[event.status]} · {event.activeParticipants} peregrinos{event.capacity ? ` de ${event.capacity}` : ""}
          {hasEventCapability(event, "REGISTRATION") && ` · ${REGISTRATION_STATE_LABEL[event.registrationState]}`}
        </div>
        <p className="muted small" style={{ margin: 0 }}>Todo lo de esta pantalla pertenece solo a este evento. Para trabajar con otro, cámbialo en el selector de eventos.</p>
      </section>
      <nav className="hub" aria-label="Secciones del evento">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}>
            <span className="tile" style={{ background: t.color }}><t.icon size={22} /></span>
            <b>{sectionLabel(t, event)}</b><span className="s">{t.sub}</span>
          </Link>
        ))}
        {create}
      </nav>
      {modal}
    </Page>
  );
}
