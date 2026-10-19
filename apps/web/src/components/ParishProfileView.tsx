"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarClock, CalendarDays, Clock, ExternalLink, FileBadge, Globe, HeartHandshake, Mail, MapPin, Megaphone, Newspaper, Phone, Radio, Share2, Users } from "lucide-react";
import { SIGYP_CATEGORY_LABEL, DONATION_PURPOSE_LABEL, EVENT_TYPE_INFO, REGISTRATION_STATE_LABEL, SCHEDULE_KIND_LABEL, WEEKDAY_LABEL, type DonationPurpose, type ScheduleKind } from "@peregrinos/shared";
import { fmtDateMedium, fmtDateTimeMedium, money } from "@/lib/format";
import type { ImageSet, ParishExtras, ParishProfile, PublicAnnouncement, PublicEvent, PublicLivestream } from "@/lib/types";

/**
 * B1 — Perfil público de una parroquia. Lo usan la página pública (/parroquias/[id]) y la vista previa del
 * superadministrador: así ve exactamente lo que verá un peregrino. `action` = botón «Seguir» (o nada en la vista previa).
 * B5 — Estado EN VIVO / FUERA DE LÍNEA con la transmisión de YouTube (reproductor y chat de YouTube), agenda pastoral,
 * donaciones (botón que abre Mercado Pago), último boletín y eventos como publicaciones con portada.
 */
export function ParishProfileView({ parish, events, extras, action, preview = false, highlightEventId }: {
  parish: ParishProfile; events: PublicEvent[]; extras?: ParishExtras | null; action?: React.ReactNode; preview?: boolean; highlightEventId?: string | null;
}) {
  const links = [
    parish.website && { href: parish.website, label: "Sitio web" },
    parish.instagram && { href: social("instagram", parish.instagram), label: "Instagram" },
    parish.facebook && { href: social("facebook", parish.facebook), label: "Facebook" },
    parish.youtube && { href: social("youtube", parish.youtube), label: "YouTube" },
    parish.tiktok && { href: social("tiktok", parish.tiktok), label: "TikTok" },
  ].filter(Boolean) as { href: string; label: string }[];
  const live = extras?.livestream?.status === "LIVE";
  const phases: [PublicEvent["phase"], string][] = [["IN_PROGRESS", "En curso"], ["UPCOMING", "Próximos"], ["FINISHED", "Finalizados"]];
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
            <span className="muted small" title="Código de la parroquia"> · Código <strong>{parish.code}</strong></span>
            {extras && <div style={{ marginTop: 6 }}><LiveBadge live={live} /></div>}
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
        {parish.officeHours && <p className="small" style={{ whiteSpace: "pre-line", margin: "8px 0 0" }}><Clock size={15} style={{ verticalAlign: "-2px" }} /> {parish.officeHours}</p>}
      </section>

      {extras && <AnnouncementsCard items={extras.announcements ?? []} preview={preview} />}

      {extras?.livestream && <LivestreamCard s={extras.livestream} preview={preview} />}

      {!!extras?.schedule.length && <ScheduleCard items={extras.schedule} />}

      {!!extras?.campaigns.length && (
        <section className="card stack-sm">
          <h2><HeartHandshake size={20} style={{ verticalAlign: "-3px" }} /> Colaborar con la parroquia</h2>
          {extras.campaigns.map((c) => (
            <article key={c.id} className="donation-card">
              {c.image?.medium && <Picture set={c.image} alt="" ratio="2 / 1" />}
              <b>{c.title}</b>
              <span className="muted small">{DONATION_PURPOSE_LABEL[c.purpose as DonationPurpose] ?? c.purpose} · Beneficiario: {c.beneficiary}</span>
              {c.description && <span className="small" style={{ whiteSpace: "pre-line" }}>{c.description}</span>}
              {preview
                ? <span className="btn btn-primary" aria-disabled="true"><HeartHandshake size={18} /> Colaborar</span>
                : <a className="btn btn-primary" href={c.url} target="_blank" rel="noopener noreferrer"><HeartHandshake size={18} /> Colaborar</a>}
              <span className="muted small">Se abre Mercado Pago para completar la donación. Peregrinos no recibe el dinero ni ve los datos de tu tarjeta.</span>
            </article>
          ))}
        </section>
      )}

      {!!extras?.bulletins.length && (
        <section className="card stack-sm">
          <h2><Newspaper size={20} style={{ verticalAlign: "-3px" }} /> Boletín parroquial</h2>
          {extras.bulletins.map((b, i) => (
            <details key={b.id} open={i === 0}>
              <summary><b>{b.title}</b> <span className="muted small">· semana del {fmtDateMedium(b.weekOf)}</span></summary>
              <p className="small" style={{ whiteSpace: "pre-line" }}>{b.body}</p>
            </details>
          ))}
        </section>
      )}

      <section className="card stack-sm">
        <h2><CalendarDays size={20} style={{ verticalAlign: "-3px" }} /> Eventos</h2>
        {!events.length && <p className="muted">No hay eventos publicados por ahora. {preview ? "Solo aparecen los eventos públicos y publicados (o en curso)." : "Sigue a la parroquia para enterarte cuando publique uno."}</p>}
        {phases.map(([phase, label]) => {
          const list = events.filter((e) => (e.phase ?? (e.status === "IN_PROGRESS" ? "IN_PROGRESS" : "UPCOMING")) === phase);
          if (!list.length) return null;
          return (
            <div key={phase} className="stack-sm">
              <h3 className="sec-title" style={{ margin: "8px 0 0" }}>{label}</h3>
              {list.map((e) => <EventPost key={e.id} e={e} parishId={parish.id} preview={preview} highlight={e.id === highlightEventId} />)}
            </div>
          );
        })}
      </section>

      {extras && !preview && (
        <section className="card stack-sm">
          <h2><FileBadge size={20} style={{ verticalAlign: "-3px" }} /> Certificados sacramentales</h2>
          <p className="small" style={{ margin: 0 }}>Pide tu partida de bautismo, confirmación o matrimonio. Te daremos un código para seguir el estado.</p>
          <div className="btn-row">
            <Link className="btn" href={`/parroquias/${parish.id}/certificado`}>Pedir un certificado</Link>
            <Link className="btn" href="/certificados">Consultar mi solicitud</Link>
          </div>
        </section>
      )}
    </div>
  );
}

function LiveBadge({ live }: { live: boolean }) {
  return live
    ? <span className="live-badge on" role="status"><Radio size={14} /> EN VIVO</span>
    : <span className="live-badge">FUERA DE LÍNEA</span>;
}

/**
 * Reproductor de YouTube (youtube-nocookie) y, en vivo, el chat de YouTube (moderado por el canal de la parroquia).
 * Si el reproductor no se puede integrar (algunas transmisiones no lo permiten), queda el botón «Abrir en YouTube».
 */
function LivestreamCard({ s, preview }: { s: PublicLivestream; preview: boolean }) {
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => { setHost(window.location.hostname); }, []);
  const live = s.status === "LIVE";
  return (
    <section className="card stack-sm" aria-labelledby="ls-title">
      <h2 id="ls-title"><Radio size={20} style={{ verticalAlign: "-3px" }} /> {live ? "Transmisión en vivo" : "Próxima transmisión"}</h2>
      <p style={{ margin: 0 }}><b>{s.title}</b>{!live && s.scheduledAt ? <span className="muted"> · {fmtDateTimeMedium(s.scheduledAt)}</span> : null}</p>
      <p className="muted small" style={{ margin: 0 }}>{s.verified ? "Estado confirmado con YouTube." : "Estado informado por la parroquia."}</p>
      {!preview && (
        <div className="video-frame">
          <iframe src={`https://www.youtube-nocookie.com/embed/${s.videoId}?rel=0&modestbranding=1`} title={`YouTube: ${s.title}`} loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        </div>
      )}
      <a className="btn" href={s.watchUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /> Abrir en YouTube</a>
      {live && !preview && host && (
        <details>
          <summary><b>Chat de la transmisión</b> <span className="muted small">(de YouTube; para escribir necesitas una cuenta de YouTube)</span></summary>
          <div className="chat-frame"><iframe src={`https://www.youtube.com/live_chat?v=${s.videoId}&embed_domain=${encodeURIComponent(host)}`} title="Chat de YouTube" loading="lazy" /></div>
        </details>
      )}
    </section>
  );
}

function ScheduleCard({ items }: { items: { id: string; kind: string; title: string; weekday: number | null; date: string | null; startTime: string; endTime: string | null; location: string | null; notes: string | null }[] }) {
  const weekly = items.filter((i) => i.weekday != null);
  const once = items.filter((i) => i.date);
  return (
    <section className="card stack-sm">
      <h2><CalendarClock size={20} style={{ verticalAlign: "-3px" }} /> Horarios y actividades</h2>
      {[0, 1, 2, 3, 4, 5, 6].map((d) => {
        const day = weekly.filter((i) => i.weekday === d);
        if (!day.length) return null;
        return (
          <div key={d} className="schedule-day">
            <b>{WEEKDAY_LABEL[d]}</b>
            <ul>{day.map((i) => <li key={i.id}><span className="sched-time">{i.startTime}{i.endTime ? `–${i.endTime}` : ""}</span> {i.title} <span className="muted small">({SCHEDULE_KIND_LABEL[i.kind as ScheduleKind] ?? i.kind}{i.location ? ` · ${i.location}` : ""})</span>{i.notes ? <span className="muted small"> — {i.notes}</span> : null}</li>)}</ul>
          </div>
        );
      })}
      {!!once.length && (
        <div className="schedule-day">
          <b>Fechas especiales</b>
          <ul>{once.map((i) => <li key={i.id}><span className="sched-time">{fmtDateMedium(i.date!)} {i.startTime}</span> {i.title}{i.location ? <span className="muted small"> · {i.location}</span> : null}</li>)}</ul>
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>Sigue a la parroquia para recibir sus avisos y el boletín con los cambios de horario.</p>
    </section>
  );
}

/** Publicación de un evento: portada, datos, inscripción y compartir (mismo evento que en la sección de eventos de siempre). */
function EventPost({ e, parishId, preview, highlight }: { e: PublicEvent; parishId: string; preview: boolean; highlight: boolean }) {
  const [shared, setShared] = useState<string | null>(null);
  async function share() {
    const url = `${window.location.origin}/parroquias/${parishId}?evento=${e.id}`;
    try {
      if (navigator.share) await navigator.share({ title: e.name, url });
      else { await navigator.clipboard.writeText(url); setShared("Enlace copiado"); setTimeout(() => setShared(null), 2500); }
    } catch { /* el usuario canceló */ }
  }
  return (
    <article id={`evento-${e.id}`} className={`acct-item event-post${highlight ? " highlight" : ""}${e.phase === "FINISHED" ? " finished" : ""}`}>
      {e.cover?.medium && <Picture set={e.cover} alt={`Portada de ${e.name}`} ratio="16 / 9" />}
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <span className="pill">{EVENT_TYPE_INFO[e.type]?.label ?? e.type}</span>
          <h3 style={{ margin: "6px 0 2px" }}>{e.name}</h3>
          <div className="muted small">{fmtDateTimeMedium(e.startsAt, e.timezone)}{e.locationName ? ` · ${e.locationName}` : ""}</div>
          {e.attendanceMode && e.attendanceMode !== "IN_PERSON" && <div className="small">{e.attendanceMode === "ONLINE" ? "Virtual" : "Presencial y virtual"}{e.onlineUrl && !preview ? <> · <a href={e.onlineUrl} target="_blank" rel="noopener noreferrer">Participar en línea</a></> : null}</div>}
        </div>
        {e.phase === "FINISHED"
          ? <span className="pill gray">Finalizado</span>
          : <span className={`pill ${e.registrationState === "OPEN" ? "ok" : e.registrationState === "FULL" ? "err" : "gray"}`}>{REGISTRATION_STATE_LABEL[e.registrationState]}</span>}
      </div>
      {e.description && <p className="small" style={{ whiteSpace: "pre-line", margin: "6px 0" }}>{e.description}</p>}
      {e.phase !== "FINISHED" && e.registrationState !== "DISABLED" && (
        <div className="muted small">
          {e.capacity != null && <>Cupo: {e.capacity}{e.spotsLeft != null && ` · quedan ${e.spotsLeft}`} · </>}
          {e.registrationFee ? `Inscripción: ${money(e.registrationFee)}` : "Inscripción sin costo"}
        </div>
      )}
      <div className="btn-row" style={{ marginTop: 8 }}>
        {e.registrationPath && e.phase !== "FINISHED"
          ? (preview ? <span className="btn btn-primary" aria-disabled="true">Inscribirme</span> : <Link className="btn btn-primary" href={e.registrationPath}>Inscribirme</Link>)
          : e.phase !== "FINISHED" && e.registrationState !== "DISABLED" && <span className="muted small">{e.registrationState === "FULL" ? "El cupo está completo." : "La inscripción no está abierta."}</span>}
        {!preview && <button type="button" className="btn btn-sm" onClick={() => void share()}><Share2 size={16} /> {shared ?? "Compartir"}</button>}
      </div>
    </article>
  );
}

/** Imagen adaptable: el navegador elige la variante (móvil 480, tableta 960, escritorio 1600) sin deformarla. */
function Picture({ set, alt, ratio }: { set: ImageSet; alt: string; ratio: string }) {
  const srcSet = [set.small && `${set.small} 480w`, set.medium && `${set.medium} 960w`, set.large && `${set.large} 1600w`].filter(Boolean).join(", ");
  return <img className="post-img" src={set.medium ?? set.large ?? set.small ?? ""} srcSet={srcSet} sizes="(max-width: 700px) 100vw, 680px" alt={alt} loading="lazy" style={{ aspectRatio: ratio }} />;
}

/** Acepta un enlace completo o un usuario (@nombre) para las redes. */
function social(net: "instagram" | "facebook" | "youtube" | "tiktok", v: string) {
  if (/^https?:\/\//i.test(v)) return v;
  const u = v.replace(/^@/, "");
  return { instagram: `https://instagram.com/${u}`, facebook: `https://facebook.com/${u}`, youtube: `https://youtube.com/@${u}`, tiktok: `https://tiktok.com/@${u}` }[net];
}

/**
 * SIGyP — Cartelera: avisos que la parroquia publica desde SIGyP (Gestión Parroquial). Solo llegan los vigentes (la API
 * filtra borradores, retirados y vencidos); sin avisos, la sección no se muestra al público y en la vista previa se explica.
 */
function AnnouncementsCard({ items, preview }: { items: PublicAnnouncement[]; preview: boolean }) {
  if (!items.length && !preview) return null;
  return (
    <section className="card stack-sm" aria-labelledby="cartelera-title" data-testid="cartelera">
      <h2 id="cartelera-title"><Megaphone size={20} style={{ verticalAlign: "-3px" }} /> Cartelera</h2>
      {!items.length && <p className="muted small" style={{ margin: 0 }}>No hay avisos vigentes. Los avisos que la parroquia publique en SIGyP aparecerán aquí mientras estén vigentes.</p>}
      {items.map((a) => (
        <article key={a.id} className="stack-sm" style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 8 }}>
          <span className="muted small">{SIGYP_CATEGORY_LABEL[a.category as keyof typeof SIGYP_CATEGORY_LABEL] ?? a.category}{a.endsAt ? ` · hasta el ${fmtDateTimeMedium(a.endsAt)}` : ""}</span>
          <b>{a.title}</b>
          <p className="small" style={{ whiteSpace: "pre-line", margin: 0, overflowWrap: "anywhere" }}>{a.body}</p>
        </article>
      ))}
    </section>
  );
}
