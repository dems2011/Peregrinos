import { MapPin } from "lucide-react";

/**
 * Marco de las pantallas públicas (sin sesión del personal): inscripción, app del peregrino y solicitud de parroquia.
 * Mismo estilo que el área de cuenta (/cuenta), sin navegación de administración.
 */
export function PublicShell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className="acct">
      <header className="acct-head">
        <span className="acct-brand"><MapPin size={26} color="#fff" fill="#1677FF" /> <span>Peregrinos · {subtitle}</span></span>
      </header>
      <main className="acct-main">{children}</main>
    </div>
  );
}
