"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/api";
import { useApp } from "./AppContext";
import { ADMIN_GROUPS, ADMIN_SECTIONS, sectionAllowed } from "./sections";
import { Page } from "./ui";

/**
 * «Menú» del superadministrador (y Configuración de quien tenga permisos): herramientas agrupadas por categoría con el
 * mismo diseño de iconos que Evento. Cada grupo aparece solo si la persona puede usar alguna de sus herramientas.
 */
export function AdminMenu({ title = "Menú" }: { title?: string }) {
  const router = useRouter();
  const { can, event, me } = useApp();
  const allowed = ADMIN_SECTIONS.filter((s) => sectionAllowed(s, can, event));
  return (
    <Page title={title}>
      {ADMIN_GROUPS.map((g) => {
        const items = allowed.filter((s) => s.group === g);
        if (!items.length) return null;
        return (
          <section key={g} aria-labelledby={`grp-${g}`}>
            <h2 id={`grp-${g}`} className="sec-title">{g}</h2>
            <nav className="hub" aria-label={g}>
              {items.map((s) => (
                <Link key={s.href} href={s.href}>
                  <span className="tile" style={{ background: s.color }}><s.icon size={22} /></span>
                  <b>{s.label}</b><span className="s">{s.sub}</span>
                </Link>
              ))}
            </nav>
          </section>
        );
      })}
      <nav className="hub" aria-label="Sesión" style={{ marginTop: 12 }}>
        <button type="button" onClick={async () => { await logout().catch(() => undefined); router.replace("/login"); }}>
          <span className="tile" style={{ background: "#D94343" }}><LogOut size={22} /></span>
          <b>Cerrar sesión</b><span className="s">{me.user.name}</span>
        </button>
      </nav>
    </Page>
  );
}
