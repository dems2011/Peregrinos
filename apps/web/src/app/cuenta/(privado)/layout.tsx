"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CalendarDays, Church, LogOut, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { AccountProvider, useAccount } from "@/components/account/AccountContext";
import { PUSH_RECEIVED_EVENT } from "@/lib/pushNotifications";

const NAV = [
  { href: "/cuenta", label: "Inicio", icon: UserRound },
  { href: "/cuenta/eventos", label: "Mis eventos", icon: CalendarDays },
  { href: "/cuenta/avisos", label: "Avisos", icon: Bell },
  { href: "/cuenta/parroquias", label: "Parroquias", icon: Church },
];

function Nav() {
  const path = usePathname();
  const { logout } = useAccount();
  // B1: avisos sin leer (se actualiza al navegar).
  const [unread, setUnread] = useState(0);
  // Se actualiza al navegar y cuando llega un push con la app abierta.
  const [pushes, setPushes] = useState(0);
  useEffect(() => {
    const on = () => setPushes((n) => n + 1);
    window.addEventListener(PUSH_RECEIVED_EVENT, on);
    return () => window.removeEventListener(PUSH_RECEIVED_EVENT, on);
  }, []);
  useEffect(() => { api<{ unread: number }>("/auth/account/notifications").then((r) => setUnread(r.unread), () => undefined); }, [path, pushes]);
  const on = (href: string) => (href === "/cuenta" ? path === href : path.startsWith(href));
  return (
    <nav className="acct-nav" aria-label="Mi cuenta">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={on(href) ? "on" : ""} aria-current={on(href) ? "page" : undefined}>
          <Icon size={20} />
          <span>{label}{href === "/cuenta/avisos" && unread > 0 && <> <span className="badge-dot" aria-label={`${unread} sin leer`}>{unread}</span></>}</span>
        </Link>
      ))}
      <button type="button" onClick={() => void logout()}><LogOut size={20} /><span>Salir</span></button>
    </nav>
  );
}

/** Pantallas que requieren la sesión de la cuenta del peregrino. */
export default function PrivadoLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      <Nav />
      <div className="stack">{children}</div>
    </AccountProvider>
  );
}
