import { BarChart3, CalendarCog, CalendarDays, ClipboardList, Clock, HandHeart, History, IdCard, KeyRound, MapPin, MessagesSquare, Phone, ScanLine, ShieldCheck, Users, Wallet } from "lucide-react";
import { hasEventCapability, type EventCapability, type Permission } from "@peregrinos/shared";

/**
 * Secciones del panel agrupadas como en la pantalla Evento (iconos lado a lado). Un mismo destino lleva el mismo nombre
 * en todos los menús (barra lateral, barra inferior, Evento y Menú).
 */
export interface Section { href: string; label: string; sub: string; icon: typeof Users; color: string; perm?: Permission | Permission[]; cap?: EventCapability }

/** Todo lo que pertenece al evento activo. */
export const EVENT_SECTIONS: Section[] = [
  { href: "/registrar", label: "Registrar llegada", sub: "Escanear o ingresar número", icon: ScanLine, color: "#7B3FE4", perm: "checkin:create", cap: "CHECKIN" },
  { href: "/pagos", label: "Pagos por revisar", sub: "Inscritos, pagos y aprobación", icon: Wallet, color: "#F29B18", perm: "payment:review", cap: "REGISTRATION" },
  { href: "/evento/formulario", label: "Formulario de inscripción", sub: "Preguntas del formulario público", icon: ClipboardList, color: "#0E9AA7", perm: "event:update", cap: "REGISTRATION" },
  { href: "/personas", label: "Personas", sub: "Participantes del evento", icon: Users, color: "#18A957", perm: "participant:read", cap: "PARTICIPANTS" },
  { href: "/recorrido", label: "Recorrido y puntos", sub: "Puntos de control del evento", icon: MapPin, color: "#1677FF", perm: "checkpoint:read", cap: "POINTS" },
  { href: "/historial", label: "Historial", sub: "Registro de llegadas por punto", icon: Clock, color: "#7B3FE4", perm: "checkin:read", cap: "CHECKIN" },
  { href: "/credenciales", label: "Credenciales", sub: "Diseño y exportación", icon: IdCard, color: "#0B3158", perm: "credential:export", cap: "PARTICIPANTS" },
  { href: "/voluntarios", label: "Voluntarios", sub: "Voluntarios, turnos y asignaciones", icon: HandHeart, color: "#D9467A", perm: "volunteer:manage", cap: "VOLUNTEERS" },
  { href: "/evento/chat", label: "Chat del evento", sub: "Equipo y peregrinos inscritos", icon: MessagesSquare, color: "#D9467A", perm: "event:read" },
  { href: "/evento/informe", label: "Informe del evento", sub: "Estadísticas, IA y PDF", icon: BarChart3, color: "#18A957", perm: "report:read" },
  { href: "/configuracion/contactos", label: "Contactos del evento", sub: "A quién pueden llamar los peregrinos", icon: Phone, color: "#18A957", perm: "contact:manage" },
  { href: "/configuracion/accesos", label: "Acceso de peregrinos", sub: "Enlaces y códigos personales", icon: KeyRound, color: "#F29B18", perm: "participant:manage" },
  { href: "/configuracion/evento", label: "Datos del evento", sub: "Tipo, fechas, lugar, trayecto, inscripción y certificado", icon: CalendarCog, color: "#1677FF", perm: "event:update" },
];

/** Configuración y administración que no dependen del evento activo. */
export const ADMIN_SECTIONS: Section[] = [
  { href: "/configuracion/eventos", label: "Eventos", sub: "Todos los eventos por tipo y estado; elegir con cuál trabajar", icon: CalendarDays, color: "#0E9AA7", perm: "event:update" },
  { href: "/configuracion/usuarios", label: "Usuarios e invitaciones", sub: "Equipo, invitaciones y puntos asignados", icon: Users, color: "#7B3FE4", perm: ["user:manage", "invitation:manage", "assignment:manage"] },
  { href: "/configuracion/auditoria", label: "Auditoría", sub: "Quién hizo cada acción", icon: History, color: "#4A5563", perm: "audit:read" },
  // Disponible para todo el personal: cada cuenta cambia su propia contraseña.
  { href: "/configuracion/seguridad", label: "Seguridad de la cuenta", sub: "Cambiar contraseña", icon: ShieldCheck, color: "#0F766E" },
];

type EventLike = Parameters<typeof hasEventCapability>[0];

/** Permiso (alguno de la lista) y, si corresponde, capacidad del evento activo. */
export function sectionAllowed(s: Section, can: (p: Permission) => boolean, event: EventLike | null | undefined) {
  const permOk = !s.perm || (Array.isArray(s.perm) ? s.perm.some((p) => can(p)) : can(s.perm));
  return permOk && (!s.cap || (!!event && hasEventCapability(event, s.cap)));
}

/** Sin recorrido, «Registrar llegada» se presenta como asistencia (igual que en la barra lateral). */
export function sectionLabel(s: Section, event: EventLike | null | undefined) {
  return s.href === "/registrar" && event && !hasEventCapability(event, "ROUTE") ? "Registrar asistencia" : s.label;
}
