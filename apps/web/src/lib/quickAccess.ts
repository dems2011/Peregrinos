import {
  Bell, CalendarDays, Church, FileCheck, HandHeart, History, KeyRound, Link2, MessagesSquare, QrCode, Search, type LucideIcon,
} from "lucide-react";

/**
 * Accesos rápidos de la pantalla principal del peregrino. Solo pantallas que ya existen en la cuenta; cada acceso dice
 * cuándo está disponible para esta cuenta (p. ej. la credencial solo con una participación confirmada).
 * La preferencia (cuáles se ven y en qué orden) se guarda en este dispositivo, por cuenta: la API no tiene hoy un lugar
 * para preferencias de usuario, así que no se sincroniza entre dispositivos.
 */
export interface QuickCtx { hasPerson: boolean; credential: boolean; chatEventId: string | null }
export interface QuickAccess { id: string; label: string; hint: string; icon: LucideIcon; color: string; href: (c: QuickCtx) => string; available: (c: QuickCtx) => boolean }

const always = () => true;
export const QUICK_ACCESSES: readonly QuickAccess[] = [
  { id: "eventos", label: "Mis eventos", hint: "Inscripciones y participaciones", icon: CalendarDays, color: "var(--navy)", href: () => "/cuenta/eventos", available: (c) => c.hasPerson },
  { id: "credencial", label: "Credencial", hint: "Tu QR para los puntos de control", icon: QrCode, color: "var(--blue)", href: () => "/cuenta/eventos", available: (c) => c.credential },
  { id: "buscar", label: "Buscar parroquia", hint: "Síguela e inscríbete en sus eventos", icon: Search, color: "var(--ok)", href: () => "/parroquias", available: always },
  { id: "avisos", label: "Avisos", hint: "Mensajes de tus parroquias", icon: Bell, color: "var(--navy-2)", href: () => "/cuenta/avisos", available: always },
  { id: "historial", label: "Historial", hint: "Participaciones y voluntariado", icon: History, color: "var(--navy)", href: () => "/cuenta/historial", available: always },
  { id: "chat", label: "Chat", hint: "Chat de tu evento", icon: MessagesSquare, color: "var(--blue)", href: (c) => `/cuenta/eventos/${c.chatEventId}`, available: (c) => !!c.chatEventId },
  { id: "parroquias", label: "Mis parroquias", hint: "Las parroquias que sigues", icon: Church, color: "var(--navy-2)", href: () => "/cuenta/parroquias", available: always },
  { id: "voluntariado", label: "Voluntariado", hint: "Código y solicitudes", icon: HandHeart, color: "var(--ok)", href: () => "/cuenta/voluntariado", available: always },
  { id: "certificados", label: "Certificados", hint: "Consultar una solicitud", icon: FileCheck, color: "var(--navy)", href: () => "/certificados", available: always },
  { id: "vincular", label: "Vincular", hint: "Con el código de una parroquia", icon: Link2, color: "var(--navy-2)", href: () => "/cuenta/vincular", available: always },
  { id: "contrasena", label: "Contraseña", hint: "Cambiar mi contraseña", icon: KeyRound, color: "var(--muted)", href: () => "/cuenta/contrasena", available: always },
];
export const DEFAULT_QUICK = ["eventos", "credencial", "buscar", "avisos", "historial"];

const key = (userId: string) => `pg.quick.v1:${userId}`;
const known = new Set(QUICK_ACCESSES.map((q) => q.id));

/** Ids visibles y en orden. Sin preferencia guardada (o ilegible) → los de siempre. */
export function loadQuick(userId: string): string[] {
  try {
    const raw = localStorage.getItem(key(userId));
    if (raw) {
      const v: unknown = JSON.parse(raw);
      if (Array.isArray(v)) return [...new Set(v.filter((x): x is string => typeof x === "string" && known.has(x)))];
    }
  } catch { /* sin almacenamiento: se usan los de siempre */ }
  return [...DEFAULT_QUICK];
}

export function saveQuick(userId: string, ids: string[]) {
  try { localStorage.setItem(key(userId), JSON.stringify(ids)); } catch { /* no se pudo guardar: queda para esta visita */ }
}
