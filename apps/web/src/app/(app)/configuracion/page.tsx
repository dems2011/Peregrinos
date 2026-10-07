"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCog, CalendarDays, ChevronRight, Church, History, KeyRound, LogOut, Phone, ShieldCheck, Users } from "lucide-react";
import { logout } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { Page } from "@/components/ui";

export default function Configuracion() {
  const router = useRouter();
  const { can } = useApp();
  const { me } = useApp();
  const items = [
    me.user.role === "SUPERADMIN" && { href: "/configuracion/parroquia", icon: Church, c: "#0B3158", t: "Perfil de la parroquia", s: "Datos públicos, logo, imagen, vista previa y avisos a seguidores" },
    can("event:update") && { href: "/configuracion/eventos", icon: CalendarDays, c: "#0E9AA7", t: "Eventos", s: "Todos los eventos por tipo y estado; crear uno nuevo" },
    can("event:update") && { href: "/configuracion/evento", icon: CalendarCog, c: "#1677FF", t: "Evento e inscripción", s: "Tipo, fechas, lugar, trayecto, inscripción y certificado" },
    (can("invitation:manage") || can("user:manage")) && { href: "/configuracion/usuarios", icon: Users, c: "#7B3FE4", t: "Usuarios e invitaciones", s: "Invitar por correo y definir el nivel de acceso" },
    can("contact:manage") && { href: "/configuracion/contactos", icon: Phone, c: "#18A957", t: "Contactos del evento", s: "A quién pueden llamar los peregrinos" },
    can("participant:manage") && { href: "/configuracion/accesos", icon: KeyRound, c: "#F29B18", t: "Acceso de peregrinos", s: "Enlaces y códigos personales" },
    can("audit:read") && { href: "/configuracion/auditoria", icon: History, c: "#4A5563", t: "Auditoría", s: "Quién hizo cada acción" },
    // Disponible para todo el personal: cada cuenta cambia su propia contraseña (BETA: sin verificación en dos pasos).
    { href: "/configuracion/seguridad", icon: ShieldCheck, c: "#0F766E", t: "Seguridad de la cuenta", s: "Cambiar contraseña" },
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
        <button className="list-item" onClick={async () => { await logout().catch(() => undefined); router.replace("/login"); }}>
          <span className="tile" style={{ background: "#D94343" }}><LogOut size={24} /></span><span className="grow"><span className="t">Cerrar sesión</span><br /><span className="s">Salir de la aplicación</span></span>
        </button>
      </div>
    </Page>
  );
}
