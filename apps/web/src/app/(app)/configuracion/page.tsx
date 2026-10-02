"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCog, ChevronRight, History, KeyRound, LogOut, Phone, Users } from "lucide-react";
import { logout } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { Page } from "@/components/ui";

export default function Configuracion() {
  const router = useRouter();
  const { can } = useApp();
  const items = [
    can("event:update") && { href: "/configuracion/evento", icon: CalendarCog, c: "#1677FF", t: "Evento e inscripción", s: "Parroquia, fecha, estado, cobro y enlace de inscripción" },
    (can("invitation:manage") || can("user:manage")) && { href: "/configuracion/usuarios", icon: Users, c: "#7B3FE4", t: "Usuarios e invitaciones", s: "Invitar por correo y definir el nivel de acceso" },
    can("contact:manage") && { href: "/configuracion/contactos", icon: Phone, c: "#18A957", t: "Contactos del evento", s: "A quién pueden llamar los peregrinos" },
    can("participant:manage") && { href: "/configuracion/accesos", icon: KeyRound, c: "#F29B18", t: "Acceso de peregrinos", s: "Enlaces y códigos personales" },
    can("audit:read") && { href: "/configuracion/auditoria", icon: History, c: "#4A5563", t: "Auditoría", s: "Quién hizo cada acción" },
  ].filter(Boolean) as { href: string; icon: typeof Users; c: string; t: string; s: string }[];
  return (
    <Page title="Configuración">
      <div className="card flat">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="list-item">
            <span className="tile" style={{ background: i.c }}><i.icon size={26} /></span>
            <span className="grow"><span className="t">{i.t}</span><br /><span className="s">{i.s}</span></span><ChevronRight className="chev" />
          </Link>
        ))}
        <button className="list-item" onClick={async () => { await logout(); router.replace("/login"); }}>
          <span className="tile" style={{ background: "#D94343" }}><LogOut size={24} /></span><span className="grow"><span className="t">Cerrar sesión</span><br /><span className="s">Salir de la aplicación</span></span>
        </button>
      </div>
    </Page>
  );
}
