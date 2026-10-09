"use client";
import { useApp } from "@/components/AppContext";
import { EventChat } from "@/components/EventChat";
import { Page } from "@/components/ui";

/** B1 — Chat del evento activo para el equipo (superadministrador, administradores y equipo con acceso al evento). */
export default function ChatEvento() {
  const { event, me } = useApp();
  if (!event) return <Page title="Chat del evento" back="/evento"><div className="empty">No hay un evento seleccionado.</div></Page>;
  return (
    <Page title="Chat del evento" back="/evento">
      <p className="muted small" style={{ margin: 0 }}>Conversación de <b>{event.name}</b>: el equipo de la parroquia y los peregrinos inscritos en este evento. No se mezcla con otros eventos.</p>
      <EventChat key={event.id} base={`/events/${event.id}/chat`} timezone={event.timezone} canModerate={me.user.role !== "OPERATOR"} viewerId={me.user.id} />
    </Page>
  );
}
