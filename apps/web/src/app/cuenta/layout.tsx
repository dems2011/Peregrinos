import Link from "next/link";
import { MapPin } from "lucide-react";

/**
 * A5.0 — Área de cuenta del peregrino. Layout propio, distinto del panel del personal:
 * sin menú de administración ni sesión del personal (usa la cookie pg_pa de la cuenta PILGRIM).
 */
export default function CuentaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="acct">
      <header className="acct-head">
        <Link href="/cuenta" className="acct-brand"><MapPin size={26} color="#fff" fill="#1677FF" /> <span>Peregrinos · Mi cuenta</span></Link>
      </header>
      <main className="acct-main">{children}</main>
    </div>
  );
}
