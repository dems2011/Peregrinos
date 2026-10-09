"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Clock, HandHeart, Home, IdCard, LogOut, Megaphone, Menu as MenuIcon, ScanLine, Settings, Users, Wallet } from "lucide-react";
import { hasEventCapability, type EventCapability, type Permission } from "@peregrinos/shared";
import { logout } from "@/lib/api";
import { BrandMark } from "./BrandMark";
import { useApp } from "./AppContext";
import { EVENT_SECTIONS } from "./sections";

export interface NavItem { href: string; label: string; icon: typeof Home; perm: Permission | "config" }
export const NAV: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home, perm: "checkin:read" },
  { href: "/personas", label: "Personas", icon: Users, perm: "participant:read" },
  { href: "/pagos", label: "Pagos por revisar", icon: Wallet, perm: "payment:review" },
  // B1: el recorrido, el chat, el informe y el resto viven dentro del evento activo (no hay un menú general de recorridos).
  { href: "/evento", label: "Evento", icon: CalendarDays, perm: "event:read" },
  { href: "/registrar", label: "Registrar llegada", icon: ScanLine, perm: "checkin:create" },
  { href: "/historial", label: "Historial", icon: Clock, perm: "checkin:read" },
  { href: "/credenciales", label: "Credenciales", icon: IdCard, perm: "credential:export" },
  { href: "/voluntarios", label: "Voluntarios", icon: HandHeart, perm: "volunteer:manage" },
  { href: "/configuracion", label: "Configuración", icon: Settings, perm: "config" },
];

/** A4: cada sección del menú depende de una capacidad del evento activo (ya no del tipo). */
const NAV_CAPABILITY: Partial<Record<string, EventCapability>> = {
  "/personas": "PARTICIPANTS", "/pagos": "REGISTRATION",
  "/registrar": "CHECKIN", "/historial": "CHECKIN", "/credenciales": "PARTICIPANTS", "/voluntarios": "VOLUNTEERS",
};

/**
 * Superadministrador: cuatro accesos (escritorio y móvil). Inicio = perfil de la parroquia; Evento = secciones del evento
 * activo; Aviso = avisos a los seguidores; Menú = configuración y administración.
 */
export const SA_NAV: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home, perm: "event:read" },
  { href: "/evento", label: "Evento", icon: CalendarDays, perm: "event:read" },
  { href: "/avisos", label: "Aviso", icon: Megaphone, perm: "event:read" },
  { href: "/menu", label: "Menú", icon: MenuIcon, perm: "event:read" },
];

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);
/** Acceso del superadministrador que corresponde a la ruta actual (las secciones viven dentro de Evento o Menú). */
function saSection(path: string): string {
  if (path === "/" || under(path, "/configuracion/parroquia")) return "/";
  if (under(path, "/evento") || EVENT_SECTIONS.some((s) => under(path, s.href))) return "/evento";
  if (under(path, "/avisos")) return "/avisos";
  return "/menu";
}

/** Menú según permisos y capacidades del evento activo. */
export function useNav() {
  const { can, event, me } = useApp();
  if (me.user.role === "SUPERADMIN") return SA_NAV;
  // Mismos permisos que las secciones de /configuracion (y que exige la API en cada una).
  const canConfig = can("event:update") || can("invitation:manage") || can("user:manage") || can("contact:manage") || can("participant:manage") || can("audit:read");
  const on = (c: EventCapability) => !event || hasEventCapability(event, c);
  return NAV
    .filter((n) => (n.perm === "config" ? canConfig : can(n.perm)))
    .filter((n) => { const c = NAV_CAPABILITY[n.href]; return !c || on(c); })
    .map((n) => (n.href === "/registrar" && !on("ROUTE") ? { ...n, label: "Registrar asistencia" } : n));
}

export function EventPicker() {
  const { events, event, setEventId, me } = useApp();
  if (me.user.role === "OPERATOR" || events.length < 2) return null;
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label htmlFor="evpick" className="muted">Evento</label>
      <select id="evpick" value={event?.id ?? ""} onChange={(e) => setEventId(e.target.value)}>
        {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { me, pendingPayments, events, event, setEventId } = useApp();
  const items = useNav();
  const sa = me.user.role === "SUPERADMIN";
  const on = (href: string) => (sa ? saSection(path) === href : href === "/" ? path === "/" : path.startsWith(href));
  // Pagos por revisar: en la barra lateral del resto del personal; para el superadministrador, dentro de Evento.
  const badgeOn = sa ? "/evento" : "/pagos";
  const find = (href: string) => items.find((i) => i.href === href);
  const mobile = sa ? SA_NAV : [find("/"), find("/personas"), find("/registrar"), find("/evento")].filter(Boolean) as NavItem[];
  const roleLabel = me.user.role === "SUPERADMIN" ? "Superadministrador" : me.user.role === "ADMIN" ? "Administrador" : "Operador";

  return (
    <div className="shell">
      <aside className="side" aria-label="Menú principal">
        <div className="logo">
          <BrandMark size={34} />
          <div><b>Peregrinos</b><small>Panel de administración</small></div>
        </div>
        {events.length > 1 && me.user.role !== "OPERATOR" && (
          <select aria-label="Evento" value={event?.id ?? ""} onChange={(e) => setEventId(e.target.value)} style={{ margin: "0 4px 8px", minHeight: 40, borderRadius: 8, border: 0, padding: "0 8px", color: "var(--text)" }}>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        {items.map((n) => (
          <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""} aria-current={on(n.href) ? "page" : undefined}>
            <n.icon size={20} /> {n.label}
            {n.href === badgeOn && pendingPayments > 0 && <span className="badge">{pendingPayments}</span>}
          </Link>
        ))}
        <div className="foot">
          {me.user.name}<br />{roleLabel}
          <button className="lnk" style={{ marginTop: 8, padding: 0, minHeight: 36 }} onClick={async () => { await logout().catch(() => undefined); router.replace("/login"); }}><LogOut size={18} /> Cerrar sesión</button>
        </div>
      </aside>

      <div className="main">
        {children}
        {/* Quién toma las llegadas y opera el panel en este dispositivo (usuario autenticado real). */}
        <footer className="resp-foot" aria-label="Administrador responsable">
          Administrador responsable: <b>{me.user.name}</b>
        </footer>
      </div>

      <nav className="bottom" aria-label="Navegación">
        {mobile.map((n) => (
          <Link key={n.href} href={n.href} className={`${on(n.href) ? "on" : ""} ${n.href === "/registrar" ? "cta" : ""}`}>
            {n.href === "/registrar" ? <span className="pill-btn"><n.icon size={28} /></span> : <n.icon size={22} />}
            {n.href === "/registrar" ? "Registrar" : n.label.replace(" por revisar", "")}
            {sa && n.href === badgeOn && pendingPayments > 0 && <span className="badge">{pendingPayments}</span>}
          </Link>
        ))}
        {!sa && (
          <Link href="/menu" className={on("/menu") ? "on" : ""}>
            <MenuIcon size={22} />Menú
            {pendingPayments > 0 && <span className="badge">{pendingPayments}</span>}
          </Link>
        )}
      </nav>
    </div>
  );
}
