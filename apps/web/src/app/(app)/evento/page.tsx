"use client";
import Link from "next/link";
import { BarChart3, ClipboardList, CreditCard, History, IdCard, ListChecks, MapPin, MessagesSquare, Settings, Users } from "lucide-react";
import { EVENT_STATUS_LABEL, EVENT_TYPE_INFO, REGISTRATION_STATE_LABEL, hasEventCapability, type EventCapability, type Permission } from "@peregrinos/shared";
import { useApp } from "@/components/AppContext";
import { Page, StatusPill } from "@/components/ui";
import { fmtDateTimeMedium } from "@/lib/format";

/**
 * B1 — Todo lo del evento activo en un solo lugar: inscripciones, formulario, recorrido y puntos, administradores,
 * chat, llegadas, credenciales e informe. Cada evento es independiente: cambiar de evento cambia todas las secciones.
 */
type Tile = { href: string; icon: typeof Users; color: string; title: string; sub: string; perm?: Permission | Permission[]; cap?: EventCapability };
const TILES: Tile[] = [
  { href: "/pagos", icon: CreditCard, color: "#F29B18", title: "Inscripciones", sub: "Inscritos, pagos y aprobación", perm: "payment:review", cap: "REGISTRATION" },
  { href: "/evento/formulario", icon: ClipboardList, color: "#0E9AA7", title: "Formulario de inscripción", sub: "Preguntas del formulario público", perm: "event:update", cap: "REGISTRATION" },
  { href: "/recorrido", icon: MapPin, color: "#1677FF", title: "Recorrido y puntos", sub: "Puntos de control del evento", perm: "checkpoint:read", cap: "POINTS" },
  { href: "/historial", icon: History, color: "#7B3FE4", title: "Llegadas", sub: "Registro de llegadas por punto", perm: "checkin:read", cap: "CHECKIN" },
  { href: "/personas", icon: Users, color: "#18A957", title: "Peregrinos", sub: "Participantes del evento", perm: "participant:read", cap: "PARTICIPANTS" },
  { href: "/configuracion/usuarios", icon: ListChecks, color: "#4A5563", title: "Administradores", sub: "Equipo y puntos asignados", perm: ["user:manage", "invitation:manage", "assignment:manage"] },
  { href: "/evento/chat", icon: MessagesSquare, color: "#D9467A", title: "Chat del evento", sub: "Equipo y peregrinos inscritos", perm: "event:read" },
  { href: "/evento/credencial", icon: IdCard, color: "#0B3158", title: "Credenciales", sub: "Diseño y exportación", perm: "credential:export", cap: "PARTICIPANTS" },
  { href: "/evento/informe", icon: BarChart3, color: "#18A957", title: "Informe del evento", sub: "Estadísticas, IA y PDF", perm: "report:read" },
  { href: "/configuracion/evento", icon: Settings, color: "#1677FF", title: "Datos del evento", sub: "Fechas, cupo, visibilidad e inscripción", perm: "event:update" },
];

export default function EventoHub() {
  const { event, can } = useApp();
  if (!event) return <Page title="Evento"><div className="empty">No hay un evento seleccionado. Crea o elige uno en Configuración → Eventos.</div></Page>;
  const allowed = (t: Tile) => (!t.perm || (Array.isArray(t.perm) ? t.perm.some((p) => can(p)) : can(t.perm))) && (!t.cap || hasEventCapability(event, t.cap));
  return (
    <Page title="Evento">
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
        {TILES.filter(allowed).map((t) => (
          <Link key={t.href} href={t.href}>
            <span className="tile" style={{ background: t.color }}><t.icon size={22} /></span>
            <b>{t.title}</b><span className="s">{t.sub}</span>
          </Link>
        ))}
      </nav>
    </Page>
  );
}
