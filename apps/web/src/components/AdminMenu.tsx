"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/api";
import { useApp } from "./AppContext";
import { ADMIN_SECTIONS, sectionAllowed } from "./sections";
import { Page } from "./ui";

/** «Menú» del superadministrador: configuración y administración con el mismo diseño de iconos que Evento. */
export function AdminMenu() {
  const router = useRouter();
  const { can, event, me } = useApp();
  return (
    <Page title="Menú">
      <nav className="hub" aria-label="Configuración y administración">
        {ADMIN_SECTIONS.filter((s) => sectionAllowed(s, can, event)).map((s) => (
          <Link key={s.href} href={s.href}>
            <span className="tile" style={{ background: s.color }}><s.icon size={22} /></span>
            <b>{s.label}</b><span className="s">{s.sub}</span>
          </Link>
        ))}
        <button type="button" onClick={async () => { await logout().catch(() => undefined); router.replace("/login"); }}>
          <span className="tile" style={{ background: "#D94343" }}><LogOut size={22} /></span>
          <b>Cerrar sesión</b><span className="s">{me.user.name}</span>
        </button>
      </nav>
    </Page>
  );
}
