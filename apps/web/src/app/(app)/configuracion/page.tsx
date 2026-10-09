"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LogOut } from "lucide-react";
import { logout } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { AdminMenu } from "@/components/AdminMenu";
import { ADMIN_SECTIONS, sectionAllowed } from "@/components/sections";
import { Page } from "@/components/ui";

/**
 * Configuración y administración (no dependen del evento activo). Lo del evento (datos, contactos, accesos) está en
 * Evento. Para el superadministrador es su «Menú» (las pantallas que vuelven aquí regresan a él).
 */
export default function Configuracion() {
  const { me } = useApp();
  return me.user.role === "SUPERADMIN" ? <AdminMenu /> : <ConfiguracionLista />;
}

function ConfiguracionLista() {
  const router = useRouter();
  const { can, event } = useApp();
  const items = ADMIN_SECTIONS.filter((s) => sectionAllowed(s, can, event));
  return (
    <Page title="Configuración">
      <div className="card flat">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="list-item">
            <span className="tile" style={{ background: i.color }}><i.icon size={26} /></span>
            <span className="grow"><span className="t">{i.label}</span><br /><span className="s">{i.sub}</span></span><ChevronRight className="chev" />
          </Link>
        ))}
        <button className="list-item" onClick={async () => { await logout().catch(() => undefined); router.replace("/login"); }}>
          <span className="tile" style={{ background: "#D94343" }}><LogOut size={24} /></span><span className="grow"><span className="t">Cerrar sesión</span><br /><span className="s">Salir de la aplicación</span></span>
        </button>
      </div>
    </Page>
  );
}
