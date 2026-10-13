import {
  BarChart3, Boxes, CalendarClock, CalendarCog, CalendarDays, Church, ClipboardList, Clock, FileBadge, HandHeart, HeartHandshake, History, IdCard,
  KeyRound, MapPin, Megaphone, MessagesSquare, Newspaper, Phone, Radio, ScanLine, ShieldCheck, Users, UsersRound, Wallet,
} from "lucide-react";
import { hasEventCapability, type EventCapability, type Permission } from "@peregrinos/shared";

/**
 * Secciones del panel agrupadas como en la pantalla Evento (iconos lado a lado). Un mismo destino lleva el mismo nombre
 * en todos los menús (barra lateral, barra inferior, Evento y Menú).
 */
/** `cap`: capacidad del evento activo; con una lista basta con que tenga alguna. */
export interface Section { href: string; label: string; sub: string; icon: typeof Users; color: string; perm?: Permission | Permission[]; cap?: EventCapability | EventCapability[] }

/** Todo lo que pertenece al evento activo. Primero lo más usado: Personas, Contactos y Mapa. */
export const EVENT_SECTIONS: Section[] = [
  { href: "/personas", label: "Personas", sub: "Participantes del evento", icon: Users, color: "#18A957", perm: "participant:read", cap: "PARTICIPANTS" },
  { href: "/configuracion/contactos", label: "Contactos del evento", sub: "A quién pueden llamar los peregrinos", icon: Phone, color: "#18A957", perm: "contact:manage" },
  // Con trayecto (origen → destino) o con puntos de control: el mapa muestra lo que el evento tenga activado.
  { href: "/recorrido", label: "Mapa y recorrido", sub: "Trayecto y puntos de control en el mapa", icon: MapPin, color: "#1677FF", perm: "checkpoint:read", cap: ["ROUTE", "POINTS"] },
  { href: "/registrar", label: "Registrar llegada", sub: "Escanear o ingresar número", icon: ScanLine, color: "#7B3FE4", perm: "checkin:create", cap: "CHECKIN" },
  { href: "/pagos", label: "Pagos por revisar", sub: "Inscritos, pagos y aprobación", icon: Wallet, color: "#F29B18", perm: "payment:review", cap: "REGISTRATION" },
  { href: "/evento/formulario", label: "Formulario de inscripción", sub: "Preguntas del formulario público", icon: ClipboardList, color: "#0E9AA7", perm: "event:update", cap: "REGISTRATION" },
  { href: "/historial", label: "Historial", sub: "Registro de llegadas por punto", icon: Clock, color: "#7B3FE4", perm: "checkin:read", cap: "CHECKIN" },
  { href: "/credenciales", label: "Credenciales", sub: "Diseño y exportación", icon: IdCard, color: "#0B3158", perm: "credential:export", cap: "PARTICIPANTS" },
  { href: "/voluntarios", label: "Voluntarios", sub: "Voluntarios, turnos y asignaciones", icon: HandHeart, color: "#D9467A", perm: "volunteer:manage", cap: "VOLUNTEERS" },
  { href: "/evento/chat", label: "Chat del evento", sub: "Equipo y peregrinos inscritos", icon: MessagesSquare, color: "#D9467A", perm: "event:read" },
  { href: "/evento/informe", label: "Informe del evento", sub: "Estadísticas, IA y PDF", icon: BarChart3, color: "#18A957", perm: "report:read" },
  { href: "/configuracion/accesos", label: "Acceso de peregrinos", sub: "Enlaces y códigos personales", icon: KeyRound, color: "#F29B18", perm: "participant:manage" },
  { href: "/configuracion/evento", label: "Datos del evento", sub: "Tipo, fechas, lugar, trayecto, inscripción y certificado", icon: CalendarCog, color: "#1677FF", perm: "event:update" },
];

/**
 * Configuración y administración que no dependen del evento activo. B5: agrupadas por categoría; cada una aparece solo
 * si la persona tiene su permiso (la API lo exige igual).
 */
export const ADMIN_GROUPS = ["Perfil y publicaciones", "Eventos y seguimiento", "Agenda y vida parroquial", "Donaciones", "Administración parroquial", "Acceso y permisos"] as const;
export type AdminGroup = (typeof ADMIN_GROUPS)[number];
export const ADMIN_SECTIONS: (Section & { group: AdminGroup })[] = [
  { group: "Perfil y publicaciones", href: "/configuracion/parroquia", label: "Perfil de la parroquia", sub: "Datos públicos, logo, código y cartel", icon: Church, color: "#0B3158", perm: "parish:profile" },
  { group: "Perfil y publicaciones", href: "/avisos", label: "Avisos", sub: "Avisos a los seguidores", icon: Megaphone, color: "#F29B18", perm: "notice:send" },
  { group: "Perfil y publicaciones", href: "/configuracion/boletin", label: "Boletín parroquial", sub: "Boletín semanal para los seguidores", icon: Newspaper, color: "#0E9AA7", perm: "notice:send" },
  { group: "Perfil y publicaciones", href: "/configuracion/transmisiones", label: "Transmisiones en vivo", sub: "Misas y celebraciones por YouTube", icon: Radio, color: "#D94343", perm: "stream:manage" },
  { group: "Eventos y seguimiento", href: "/configuracion/eventos", label: "Eventos", sub: "Todos los eventos por tipo y estado; elegir con cuál trabajar", icon: CalendarDays, color: "#0E9AA7", perm: "event:update" },
  { group: "Agenda y vida parroquial", href: "/configuracion/agenda", label: "Agenda pastoral", sub: "Misas, confesiones, adoración y actividades", icon: CalendarClock, color: "#18A957", perm: "agenda:manage" },
  { group: "Agenda y vida parroquial", href: "/configuracion/grupos", label: "Grupos pastorales", sub: "Grupos, miembros y asistencia", icon: UsersRound, color: "#7B3FE4", perm: "group:manage" },
  { group: "Donaciones", href: "/configuracion/donaciones", label: "Donaciones", sub: "Campañas con enlace de Mercado Pago", icon: HeartHandshake, color: "#D9467A", perm: "donation:manage" },
  { group: "Administración parroquial", href: "/configuracion/certificados", label: "Certificados", sub: "Solicitudes de partidas sacramentales", icon: FileBadge, color: "#1677FF", perm: "certificate:manage" },
  { group: "Administración parroquial", href: "/configuracion/inventario", label: "Inventario", sub: "Bienes y recursos de la parroquia", icon: Boxes, color: "#4A5563", perm: "inventory:manage" },
  { group: "Acceso y permisos", href: "/configuracion/usuarios", label: "Usuarios e invitaciones", sub: "Equipo, invitaciones, permisos y puntos asignados", icon: Users, color: "#7B3FE4", perm: ["user:manage", "invitation:manage", "assignment:manage"] },
  { group: "Acceso y permisos", href: "/configuracion/auditoria", label: "Auditoría", sub: "Quién hizo cada acción", icon: History, color: "#4A5563", perm: "audit:read" },
  // Disponible para todo el personal: cada cuenta cambia su propia contraseña.
  { group: "Acceso y permisos", href: "/configuracion/seguridad", label: "Seguridad de la cuenta", sub: "Cambiar contraseña", icon: ShieldCheck, color: "#0F766E" },
];

type EventLike = Parameters<typeof hasEventCapability>[0];

/** Permiso (alguno de la lista) y, si corresponde, capacidad del evento activo. */
export function sectionAllowed(s: Section, can: (p: Permission) => boolean, event: EventLike | null | undefined) {
  const permOk = !s.perm || (Array.isArray(s.perm) ? s.perm.some((p) => can(p)) : can(s.perm));
  const caps = s.cap === undefined ? [] : Array.isArray(s.cap) ? s.cap : [s.cap];
  return permOk && (caps.length === 0 || (!!event && caps.some((c) => hasEventCapability(event, c))));
}

/** Sin recorrido, «Registrar llegada» se presenta como asistencia (igual que en la barra lateral). */
export function sectionLabel(s: Section, event: EventLike | null | undefined) {
  return s.href === "/registrar" && event && !hasEventCapability(event, "ROUTE") ? "Registrar asistencia" : s.label;
}
