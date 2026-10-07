"use client";
import Link from "next/link";
import { CalendarDays, Globe, Mail, MapPin, Phone, Users } from "lucide-react";
import { EVENT_TYPE_INFO, REGISTRATION_STATE_LABEL } from "@peregrinos/shared";
import { fmtDateTimeMedium, money } from "@/lib/format";
import type { ParishProfile, PublicEvent } from "@/lib/types";

/**
 * B1 — Perfil público de una parroquia. Lo usan la página pública (/parroquias/[id]) y la vista previa del
 * superadministrador: así ve exactamente lo que verá un peregrino. `action` = botón «Seguir» (o nada en la vista previa).
 */
export function ParishProfileView({ parish, events, action, preview = false, highlightEventId }: { parish: ParishProfile; events: PublicEvent[]; action?: React.ReactNode; preview?: boolean; highlightEventId?: string | null }) {
  const links = [
    parish.website && { href: parish.website, label: "Sitio web" },
    parish.instagram && { href: social("instagram", parish.instagram), label: "Instagram" },
    parish.facebook && { href: social("facebook", parish.facebook), label: "Facebook" },
    parish.youtube && { href: social("youtube", parish.youtube), label: "YouTube" },
    parish.tiktok && { href: social("tiktok", parish.tiktok), label: "TikTok" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <div className="parish">
      <section className="card parish-head">
        {parish.coverUrl && <img className="parish-cover" src={parish.coverUrl} alt="" />}
        <div className="parish-id">
          {parish.logoUrl
            ? <img className="parish-logo" src={parish.logoUrl} alt={`Logo de ${parish.name}`} />
            : <span className="parish-logo placeholder" aria-hidden="true">{parish.name.charAt(0)}</span>}
          <div className="parish-title">
            <h1>{parish.name}</h1>
            <span className="muted small"><Users size={14} style={{ verticalAlign: "-2px" }} /> {parish.followerCount} {parish.followerCount === 1 ? "seguidor" : "seguidores"}</span>
          </div>
        </div>
        {action && <div style={{ marginTop: 12 }}>{action}</div>}
        {parish.description && <p style={{ whiteSpace: "pre-line" }}>{parish.description}</p>}
        <div className="parish-info">
          {parish.address && <span><MapPin size={15} /> {parish.address}</span>}
          {parish.phone && <a href={`tel:${parish.phone}`}><Phone size={15} /> {parish.phone}</a>}
          {parish.email && <a href={`mailto:${parish.email}`}><Mail size={15} /> {parish.email}</a>}
          {links.map((l) => <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"><Globe size={15} /> {l.label}</a>)}
        </div>
      </section>

      <section className="card stack-sm">
        <h2><CalendarDays size={20} style={{ verticalAlign: "-3px" }} /> Eventos</h2>
        {!events.length && <p className="muted">No hay eventos publicados por ahora. {preview ? "Solo aparecen los eventos públicos y publicados (o en curso)." : "Sigue a la parroquia para enterarte cuando publique uno."}</p>}
        {events.map((e) => (
          <article key={e.id} id={`evento-${e.id}`} className={`acct-item${e.id === highlightEventId ? " highlight" : ""}`}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <span className="pill">{EVENT_TYPE_INFO[e.type]?.label ?? e.type}</span>
                <h3 style={{ margin: "6px 0 2px" }}>{e.name}</h3>
                <div className="muted small">{fmtDateTimeMedium(e.startsAt, e.timezone)}{e.locationName ? ` · ${e.locationName}` : ""}</div>
              </div>
              <span className={`pill ${e.registrationState === "OPEN" ? "ok" : e.registrationState === "FULL" ? "err" : "gray"}`}>{REGISTRATION_STATE_LABEL[e.registrationState]}</span>
            </div>
            {e.description && <p className="small" style={{ whiteSpace: "pre-line", margin: "6px 0" }}>{e.description}</p>}
            <div className="muted small">
              {e.capacity != null && <>Cupo: {e.capacity}{e.spotsLeft != null && ` · quedan ${e.spotsLeft}`} · </>}
              {e.registrationFee ? `Inscripción: ${money(e.registrationFee)}` : "Inscripción sin costo"}
            </div>
            {e.registrationPath
              ? (preview ? <span className="btn btn-primary" aria-disabled="true" style={{ marginTop: 8 }}>Inscribirme</span>
                : <Link className="btn btn-primary" style={{ marginTop: 8 }} href={e.registrationPath}>Inscribirme</Link>)
              : <p className="muted small" style={{ marginTop: 6 }}>{e.registrationState === "FULL" ? "El cupo está completo." : "La inscripción no está abierta."}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}

/** Acepta un enlace completo o un usuario (@nombre) para las redes. */
function social(net: "instagram" | "facebook" | "youtube" | "tiktok", v: string) {
  if (/^https?:\/\//i.test(v)) return v;
  const u = v.replace(/^@/, "");
  return { instagram: `https://instagram.com/${u}`, facebook: `https://facebook.com/${u}`, youtube: `https://youtube.com/@${u}`, tiktok: `https://tiktok.com/@${u}` }[net];
}
