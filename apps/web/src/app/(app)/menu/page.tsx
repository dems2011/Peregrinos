"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LogOut } from "lucide-react";
import { logout } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { EventPicker, useNav } from "@/components/Shell";
import { Page } from "@/components/ui";

const COLORS: Record<string, string> = { "/": "#1677FF", "/personas": "#18A957", "/pagos": "#F29B18", "/evento": "#0B3158", "/registrar": "#7B3FE4", "/historial": "#F29B18", "/credenciales": "#0E9AA7", "/voluntarios": "#D9467A", "/configuracion": "#4A5563" };
const SUB: Record<string, string> = {
  "/": "Resumen del evento", "/personas": "Ver, agregar o editar personas", "/pagos": "Confirmar comprobantes de pago", "/evento": "Recorrido, chat, informe y todo el evento",
  "/registrar": "Escanear o ingresar número", "/historial": "Ver registros de llegadas", "/credenciales": "Exportar carnets para imprimir", "/voluntarios": "Voluntarios, turnos y asignaciones", "/configuracion": "Ajustes, usuarios e invitaciones",
};

export default function Menu() {
  const router = useRouter();
  const items = useNav();
  const { pendingPayments, me } = useApp();
  return (
    <Page title="Menú principal">
      <EventPicker />
      <div className="card flat">
        {items.map((n) => (
          <Link key={n.href} href={n.href} className="list-item">
            <span className="tile" style={{ background: COLORS[n.href] ?? "#1677FF" }}><n.icon size={26} /></span>
            <span className="grow"><span className="t">{n.label}</span><br /><span className="s">{SUB[n.href]}</span></span>
            {n.href === "/pagos" && pendingPayments > 0 && <span className="pill err">{pendingPayments}</span>}
            <ChevronRight className="chev" />
          </Link>
        ))}
        <button className="list-item" onClick={async () => { await logout().catch(() => undefined); router.replace("/login"); }}>
          <span className="tile" style={{ background: "#D94343" }}><LogOut size={24} /></span>
          <span className="grow"><span className="t">Cerrar sesión</span><br /><span className="s">{me.user.name}</span></span>
        </button>
      </div>
    </Page>
  );
}
