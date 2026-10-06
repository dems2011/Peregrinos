"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HandHeart, History, KeyRound, Link2, LogOut, UserRound } from "lucide-react";
import { AccountProvider, useAccount } from "@/components/account/AccountContext";

const NAV = [
  { href: "/cuenta", label: "Mi cuenta", icon: UserRound },
  { href: "/cuenta/historial", label: "Mi historial", icon: History },
  { href: "/cuenta/vincular", label: "Vincular", icon: Link2 },
  { href: "/cuenta/voluntariado", label: "Voluntariado", icon: HandHeart },
  { href: "/cuenta/contrasena", label: "Contraseña", icon: KeyRound },
];

function Nav() {
  const path = usePathname();
  const { logout } = useAccount();
  return (
    <nav className="acct-nav" aria-label="Mi cuenta">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={path === href ? "on" : ""} aria-current={path === href ? "page" : undefined}><Icon size={20} /><span>{label}</span></Link>
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
