"use client";
import Link from "next/link";
import { ChevronRight, HandHeart, History, KeyRound, Link2, Search } from "lucide-react";
import { useAccount } from "@/components/account/AccountContext";
import { fmtDate, viewerTimeZone } from "@/lib/format";

const fmt = (iso: string | null) => (iso ? fmtDate(iso, viewerTimeZone()) : "—");

/**
 * Mi cuenta: datos tal como los devuelve /api/auth/account/me y los pasos para participar
 * (buscar parroquia → seguirla → inscribirse en un evento → avisos y chat del evento).
 */
export default function MiCuenta() {
  const { me } = useAccount();
  const p = me.person;
  const links = [
    { href: "/parroquias", icon: Search, t: "Buscar una parroquia", s: "Síguela e inscríbete en sus eventos" },
    { href: "/cuenta/historial", icon: History, t: "Mi historial", s: "Participaciones, inscripciones y voluntariado" },
    { href: "/cuenta/vincular", icon: Link2, t: "Vincular con un código", s: "Si una parroquia te registró antes de tener cuenta" },
    { href: "/cuenta/voluntariado", icon: HandHeart, t: "Voluntariado", s: "Código y solicitudes para ser voluntario" },
    { href: "/cuenta/contrasena", icon: KeyRound, t: "Contraseña", s: "Cambiar mi contraseña" },
  ];
  return (
    <>
      <section className="card stack-sm">
        <h2>Hola, {p?.firstName ?? me.user.name}</h2>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li><Link href="/parroquias">Busca tu parroquia</Link> y pulsa «Seguir» para recibir sus avisos.</li>
          <li>En su perfil, elige un evento y pulsa «Inscribirme».</li>
          <li>En «Mis eventos» verás tus inscripciones, tu credencial con QR y el chat de cada evento.</li>
          <li>En «Avisos» llegan los mensajes de las parroquias que sigues.</li>
        </ol>
      </section>
      <section className="card flat">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="list-item">
            <l.icon size={22} /><span className="grow"><span className="t">{l.t}</span><br /><span className="s">{l.s}</span></span><ChevronRight className="chev" />
          </Link>
        ))}
      </section>
      <section className="card stack-sm">
        <h2>Mis datos</h2>
        <dl className="kv">
          <dt>Nombre</dt><dd>{p?.firstName ?? "—"}</dd>
          <dt>Apellido</dt><dd>{p?.lastName ?? "—"}</dd>
          <dt>Documento</dt><dd>{p?.documentNumber ? `${p.documentType ?? ""} ${p.documentNumber}`.trim() : "—"}</dd>
          <dt>Teléfono</dt><dd>{p?.phone ?? "—"}</dd>
          <dt>Correo</dt><dd style={{ overflowWrap: "anywhere" }}>{me.user.email}</dd>
          <dt>Cuenta creada</dt><dd>{fmt(me.user.createdAt)}</dd>
        </dl>
        <p className="muted small">Para corregir tu nombre o documento, consulta con la organización: estos datos no se cambian desde la cuenta.</p>
      </section>
    </>
  );
}
