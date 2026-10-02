"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Clock, CreditCard, Home, IdCard, LogOut, MapPin, Menu as MenuIcon, ScanLine, Settings, Users, Wallet } from "lucide-react";
import type { Permission } from "@peregrinos/shared";
import { logout } from "@/lib/api";
import { useApp } from "./AppContext";

export interface NavItem { href: string; label: string; icon: typeof Home; perm: Permission | "config" }
export const NAV: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home, perm: "checkin:read" },
  { href: "/personas", label: "Personas", icon: Users, perm: "participant:read" },
  { href: "/pagos", label: "Pagos por revisar", icon: Wallet, perm: "payment:review" },
  { href: "/recorrido", label: "Recorrido", icon: MapPin, perm: "checkpoint:read" },
  { href: "/registrar", label: "Registrar llegada", icon: ScanLine, perm: "checkin:create" },
  { href: "/historial", label: "Historial", icon: Clock, perm: "checkin:read" },
  { href: "/credenciales", label: "Credenciales", icon: IdCard, perm: "credential:export" },
  { href: "/configuracion", label: "Configuración", icon: Settings, perm: "config" },
];

export function useNav() {
  const { can } = useApp();
  const canConfig = can("event:update") || can("invitation:manage") || can("contact:manage") || can("audit:read");
  return NAV.filter((n) => (n.perm === "config" ? canConfig : can(n.perm)));
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
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const find = (href: string) => items.find((i) => i.href === href);
  const mobile = [find("/"), find("/personas"), find("/registrar"), find("/recorrido")].filter(Boolean) as NavItem[];
  const roleLabel = me.user.role === "SUPERADMIN" ? "Superadministrador" : me.user.role === "ADMIN" ? "Administrador" : "Operador";

  return (
    <div className="shell">
      <aside className="side" aria-label="Menú principal">
        <div className="logo">
          <MapPin size={34} color="#fff" fill="#1677FF" />
          <div><b>Peregrinos</b><small>Panel de administración</small></div>
        </div>
        {events.length > 1 && me.user.role !== "OPERATOR" && (
          <select aria-label="Evento" value={event?.id ?? ""} onChange={(e) => setEventId(e.target.value)} style={{ margin: "0 4px 8px", minHeight: 40, borderRadius: 8, border: 0, padding: "0 8px" }}>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        {items.map((n) => (
          <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""} aria-current={on(n.href) ? "page" : undefined}>
            <n.icon size={20} /> {n.label}
            {n.href === "/pagos" && pendingPayments > 0 && <span className="badge">{pendingPayments}</span>}
          </Link>
        ))}
        <div className="foot">
          {me.user.name}<br />{roleLabel}
          <button className="lnk" style={{ marginTop: 8, padding: 0, minHeight: 36 }} onClick={async () => { await logout(); router.replace("/login"); }}><LogOut size={18} /> Cerrar sesión</button>
        </div>
      </aside>

      <div className="main">{children}</div>

      <nav className="bottom" aria-label="Navegación">
        {mobile.map((n) => (
          <Link key={n.href} href={n.href} className={`${on(n.href) ? "on" : ""} ${n.href === "/registrar" ? "cta" : ""}`}>
            {n.href === "/registrar" ? <span className="pill-btn"><n.icon size={28} /></span> : <n.icon size={22} />}
            {n.href === "/registrar" ? "Registrar" : n.label.replace(" por revisar", "")}
          </Link>
        ))}
        <Link href="/menu" className={on("/menu") ? "on" : ""}>
          <MenuIcon size={22} />Menú
          {pendingPayments > 0 && <span className="badge">{pendingPayments}</span>}
        </Link>
      </nav>
    </div>
  );
}
