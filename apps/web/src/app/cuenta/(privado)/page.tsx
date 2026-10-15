"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Bell, CalendarDays, Check, ChevronRight, Eye, EyeOff, MapPin, MessagesSquare, Phone, QrCode, Route, Settings2 } from "lucide-react";
import { EVENT_TYPE_INFO, type EventType, type PilgrimMe } from "@peregrinos/shared";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useAccount } from "@/components/account/AccountContext";
import type { MapPoint } from "@/components/MapView";
import { DEFAULT_QUICK, QUICK_ACCESSES, loadQuick, saveQuick, type QuickCtx } from "@/lib/quickAccess";
import { fmtDate, fmtDateMedium, fmtNumber, fmtTime, pad, viewerTimeZone } from "@/lib/format";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="map" /> });
const fmt = (iso: string | null) => (iso ? fmtDate(iso, viewerTimeZone()) : "—");

/**
 * GET /api/auth/account/progress: el evento actual y SUS herramientas (según las capacidades del evento, no su tipo).
 * Puntos y avance con las mismas reglas que el acceso personal.
 */
interface RouteStop { checkpointId: string; order: number; name: string; latitude: number | null; longitude: number | null; arrived: boolean; timestamp: string | null }
interface Current {
  participant: { id: string; number: number };
  event: {
    id: string; name: string; type: EventType; status: "IN_PROGRESS" | "SCHEDULED" | "FINISHED"; startsAt: string; endsAt: string | null; timezone: string; organization: string;
    place: { name: string | null; address: string | null; latitude: number | null; longitude: number | null } | null;
  };
  tools: { points: boolean; checkin: boolean; journey: boolean; location: boolean; contacts: boolean };
  route: RouteStop[]; progress: { done: number; total: number; percent: number };
  journey: { originName: string | null; originLat: number | null; originLng: number | null; destinationName: string | null; destinationLat: number | null; destinationLng: number | null; distanceKm: number | null } | null;
  contacts: PilgrimMe["contacts"];
}
interface MyEvent { id: string; name: string; participant?: { id: string; status: string }; chat: boolean }
interface Notifs { unread: number; items: { id: string; title: string; organization: { name: string } }[] }

const STATUS: Record<Current["event"]["status"], [string, string]> = { IN_PROGRESS: ["En curso", "ok"], SCHEDULED: ["Programado", ""], FINISHED: ["Terminado", "gray"] };

/**
 * Pantalla principal del peregrino (cuenta): saludo, avance del recorrido, accesos rápidos configurables, mapa de los
 * puntos, credencial y comunidad (avisos y chat). Todo con datos de la API; sin datos se muestra un estado vacío.
 */
export default function MiCuenta() {
  const { me } = useAccount();
  const p = me.person;
  const progress = useLoad(() => api<{ current: Current | null }>("/auth/account/progress"), []);
  const events = useLoad(() => (p ? api<{ items: MyEvent[] }>("/auth/account/events") : Promise.resolve({ items: [] })), [p?.id]);
  const notifs = useLoad(() => api<Notifs>("/auth/account/notifications"), []);
  const current = progress.data?.current ?? null;

  // Credencial y chat del MISMO evento que se muestra. Sin evento actual (p. ej. inscripción aún sin confirmar), el
  // primero que los tenga, rotulado con su nombre. Nunca se mezclan datos de dos participaciones.
  const items = events.data?.items ?? [];
  const credEvent = current ? items.find((e) => e.id === current.event.id && e.participant?.status === "ACTIVE") : items.find((e) => e.participant?.status === "ACTIVE");
  const chatEvent = current ? items.find((e) => e.id === current.event.id && e.chat) : items.find((e) => e.chat);
  const ctx: QuickCtx = { hasPerson: !!p, credential: !!credEvent, chatEventId: chatEvent?.id ?? null };

  const name = p?.firstName ?? me.user.name;
  const unread = notifs.data?.unread ?? 0;
  return (
    <>
      <header className="home-hello">
        <span className="home-avatar" aria-hidden="true">{initials(p ? `${p.firstName} ${p.lastName ?? ""}` : me.user.name)}</span>
        <h1>{current && !current.tools.points && !current.tools.journey ? "¡Hola, " : "¡Buen camino, "}<span>{name}!</span></h1>
        <Link href="/cuenta/avisos" className="home-bell" aria-label={unread ? `Avisos: ${unread} sin leer` : "Avisos"}>
          <Bell size={22} />{unread > 0 && <span className="badge-dot" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
        </Link>
      </header>

      <EventCard current={current} loading={progress.loading} error={progress.error} hasPerson={!!p} />
      {current && items.length > 1 && <Link href="/cuenta/eventos" className="small home-more">Ver todos mis eventos ({items.length}) <ChevronRight size={14} aria-hidden="true" /></Link>}

      <QuickAccesses userId={me.user.id} ctx={ctx} ready={!events.loading && !progress.loading} />

      {current && <RouteMap current={current} />}

      {credEvent?.participant && (
        <section className="home-cred">
          <div className="home-cred-card" aria-hidden="true">
            <small>Credencial de peregrino</small>
            <img src={`/api/auth/account/participations/${credEvent.participant.id}/qr.svg`} alt="" />
          </div>
          <div className="home-cred-body">
            <h2>Credencial digital</h2>
            <p>{credEvent.name}</p>
            <Link className="btn home-cred-btn" href="/cuenta/eventos"><QrCode size={18} /> Ver credencial</Link>
          </div>
        </section>
      )}

      {current && <Contacts contacts={current.contacts} />}

      <section className="stack-sm">
        <h2 className="home-h">Comunidad</h2>
        <div className="home-community">
          <Link href="/cuenta/avisos" className="card home-mini">
            <Bell size={22} className="home-mini-ic" />
            <span className="grow"><b>{unread ? `${unread} aviso${unread === 1 ? "" : "s"} sin leer` : "Avisos"}</b>
              <span className="s">{notifs.data?.items[0] ? `${notifs.data.items[0].organization.name}: ${notifs.data.items[0].title}` : "De las parroquias que sigues"}</span></span>
          </Link>
          {events.loading || progress.loading ? (
            <div className="card home-mini" aria-busy="true"><MessagesSquare size={22} className="home-mini-ic" /><span className="grow"><b>Chat del evento</b><span className="s">Cargando…</span></span></div>
          ) : chatEvent ? (
            <Link href={`/cuenta/eventos/${chatEvent.id}`} className="card home-mini">
              <MessagesSquare size={22} className="home-mini-ic" />
              <span className="grow"><b>Chat del evento</b><span className="s">{chatEvent.name}</span></span>
            </Link>
          ) : (
            <Link href="/parroquias" className="card home-mini">
              <MessagesSquare size={22} className="home-mini-ic" />
              <span className="grow"><b>Chat del evento</b><span className="s">Inscríbete en un evento para conversar</span></span>
            </Link>
          )}
        </div>
      </section>

      <details className="card home-data">
        <summary><b>Mis datos</b><ChevronRight className="chev" size={18} /></summary>
        <dl className="kv">
          <dt>Nombre</dt><dd>{p?.firstName ?? "—"}</dd>
          <dt>Apellido</dt><dd>{p?.lastName ?? "—"}</dd>
          <dt>Documento</dt><dd>{p?.documentNumber ? `${p.documentType ?? ""} ${p.documentNumber}`.trim() : "—"}</dd>
          <dt>Teléfono</dt><dd>{p?.phone ?? "—"}</dd>
          <dt>Correo</dt><dd style={{ overflowWrap: "anywhere" }}>{me.user.email}</dd>
          <dt>Cuenta creada</dt><dd>{fmt(me.user.createdAt)}</dd>
        </dl>
        <p className="muted small">Para corregir tu nombre o documento, consulta con la organización: estos datos no se cambian desde la cuenta.</p>
      </details>
    </>
  );
}

const initials = (s: string) => s.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/**
 * Evento actual y sus herramientas. Lo que aparece lo deciden las capacidades del evento:
 *  - POINTS + CHECKIN → avance (llegadas sobre puntos; sin puntos, aviso sin porcentaje);
 *  - POINTS sin CHECKIN → solo la lista de puntos (no hay llegadas que contar, así que no hay porcentaje);
 *  - ROUTE → trayecto (origen, destino, distancia); LOCATION → lugar. Otros tipos (retiro, encuentro…) muestran lo que usen.
 */
function EventCard({ current, loading, error, hasPerson }: { current: Current | null; loading: boolean; error: string | null; hasPerson: boolean }) {
  if (loading) return <section className="card home-progress" aria-busy="true"><span className="muted">Cargando tu evento…</span></section>;
  if (error) return <section className="card home-progress"><div className="alert err">No se pudo cargar tu evento. Intenta nuevamente más tarde.</div></section>;
  if (!current) return (
    <section className="card home-progress">
      <span className="home-kicker">Tu evento</span>
      <h2>Todavía no tienes un evento confirmado</h2>
      <p className="muted" style={{ margin: 0 }}>
        {hasPerson ? "Cuando la parroquia confirme tu participación en un evento, aquí verás su información y, si el evento tiene puntos de control, tu avance."
          : "Busca tu parroquia, síguela e inscríbete en un evento. Si ya te registró una parroquia, vincula tu cuenta con su código."}
      </p>
      <div className="btn-row">
        <Link className="btn btn-primary btn-sm" href="/parroquias">Buscar una parroquia</Link>
        {!hasPerson && <Link className="btn btn-sm" href="/cuenta/vincular">Vincular</Link>}
      </div>
    </section>
  );
  const { event: e, tools, route, progress: pr, journey } = current;
  const tz = e.timezone;
  const [label, pill] = STATUS[e.status];
  const withProgress = tools.points && tools.checkin;
  const next = route.find((r) => !r.arrived);
  const when = `${fmtDateMedium(e.startsAt, tz)}${e.endsAt && fmtDateMedium(e.endsAt, tz) !== fmtDateMedium(e.startsAt, tz) ? ` – ${fmtDateMedium(e.endsAt, tz)}` : ""}`;
  const Ic = tools.points || tools.journey ? Route : CalendarDays;
  return (
    <section className="card home-progress" aria-labelledby="home-progress-t">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <span className="home-kicker" id="home-progress-t">{withProgress ? "Avance del recorrido" : EVENT_TYPE_INFO[e.type]?.label ?? "Tu evento"}</span>
        <span className={`pill ${pill}`}>{label}</span>
      </div>
      <div className="home-progress-main">
        <div style={{ minWidth: 0 }}>
          {withProgress && pr.total > 0 && <div className="home-big">{pr.percent}%</div>}
          <div className="home-event"><b>{e.name}</b></div>
          <div className="muted small">{withProgress && `${EVENT_TYPE_INFO[e.type]?.label ?? ""} · `}{e.organization} · {when} · N.º {pad(current.participant.number)}</div>
          {e.place && <div className="muted small home-place"><MapPin size={14} aria-hidden="true" /> {[e.place.name, e.place.address].filter(Boolean).join(" · ")}</div>}
        </div>
        <Ic className="home-progress-ic" size={56} aria-hidden="true" />
      </div>
      {journey && (journey.originName || journey.destinationName) && (
        <div className="home-journey small">
          <Route size={16} aria-hidden="true" />
          <span><b>Trayecto:</b> {[journey.originName, journey.destinationName].filter(Boolean).join(" → ")}{journey.distanceKm ? ` · ${fmtNumber(journey.distanceKm)} km` : ""}</span>
        </div>
      )}
      {withProgress && (pr.total === 0 ? (
        <div className="alert info" role="status">Este evento todavía no tiene puntos de control publicados. Cuando la parroquia los cargue, aquí verás tu avance.</div>
      ) : (
        <>
          <div className="progress home-bar" role="progressbar" aria-valuenow={pr.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del recorrido" aria-valuetext={`${pr.done} de ${pr.total} puntos`}>
            <i style={{ width: `${pr.percent}%` }} />
          </div>
          <div className="row small"><span><b>{pr.done}</b> de <b>{pr.total}</b> puntos de control</span>{next && e.status !== "FINISHED" && <span className="muted" style={{ textAlign: "right", overflowWrap: "anywhere" }}>Próximo: {next.name}</span>}</div>
        </>
      ))}
      {tools.points && route.length > 0 && (
        <ol className="home-stops" aria-label="Puntos de control">
          {route.map((r) => (
            <li key={r.checkpointId} className={withProgress && r.arrived ? "done" : ""}>
              <span className="home-stop-dot" aria-hidden="true">{withProgress && r.arrived ? <Check size={13} /> : r.order}</span>
              <span className="home-stop-name">{r.name}</span>
              {withProgress && <span className="sr-only">{r.arrived ? "completado" : "pendiente"}</span>}
              {withProgress && r.arrived && r.timestamp && <span className="home-stop-time">{fmtTime(r.timestamp, tz)}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Contactos del evento (capacidad CONTACTS): los mismos que ve el peregrino en su acceso personal. */
function Contacts({ contacts }: { contacts: PilgrimMe["contacts"] }) {
  if (!contacts.length) return null;
  return (
    <section className="stack-sm" aria-labelledby="home-contacts-t">
      <h2 className="home-h" id="home-contacts-t">Contactos del evento</h2>
      <div className="card flat">
        {contacts.map((c) => (
          <a key={c.id} href={`tel:${c.phone}`} className="list-item">
            <Phone size={20} className="home-mini-ic" aria-hidden="true" />
            <span className="grow"><span className="t">{c.name}</span>{c.isEmergency && <> <span className="pill err">Emergencias</span></>}<br />
              <span className="s">{[c.roleLabel, c.checkpointName, c.phone].filter(Boolean).join(" · ")}</span></span>
            <ChevronRight className="chev" />
          </a>
        ))}
      </div>
    </section>
  );
}

/** Accesos rápidos: solo los disponibles para esta cuenta; el peregrino elige cuáles ve y en qué orden. */
function QuickAccesses({ userId, ctx, ready }: { userId: string; ctx: QuickCtx; ready: boolean }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setIds(loadQuick(userId)); }, [userId]);
  const byId = useMemo(() => new Map(QUICK_ACCESSES.map((q) => [q.id, q])), []);
  // Los no disponibles se conservan en la preferencia (aparecen cuando lo estén) pero no se muestran ni se editan.
  const avail = (id: string) => byId.get(id)?.available(ctx) ?? false;
  const shown = (ids ?? []).filter(avail);
  const hidden = QUICK_ACCESSES.filter((q) => q.available(ctx) && !(ids ?? []).includes(q.id));
  const update = (next: string[]) => { setIds(next); saveQuick(userId, next); };
  const move = (id: string, dir: -1 | 1) => {
    // Se mueve entre los visibles (saltando los no disponibles) y se conserva el resto en su lugar.
    const all = [...(ids ?? [])], i = shown.indexOf(id), other = shown[i + dir];
    if (other === undefined) return;
    const a = all.indexOf(id), b = all.indexOf(other);
    [all[a], all[b]] = [all[b], all[a]];
    update(all);
  };

  return (
    <section className="stack-sm" aria-labelledby="home-quick-t">
      <div className="row">
        <h2 className="home-h" id="home-quick-t">Accesos rápidos</h2>
        <button type="button" className="btn btn-sm btn-ghost home-edit" onClick={() => setEditing(!editing)} aria-expanded={editing} aria-controls="home-quick-edit">
          <Settings2 size={16} /> {editing ? "Listo" : "Personalizar"}
        </button>
      </div>
      {ids && ready && (shown.length ? (
        <ul className="home-quick">
          {shown.map((id) => { const q = byId.get(id)!; return (
            <li key={id}><Link href={q.href(ctx)}><span className="home-quick-ic" style={{ background: q.color }}><q.icon size={26} aria-hidden="true" /></span><span>{q.label}</span></Link></li>
          ); })}
        </ul>
      ) : <p className="muted small" style={{ margin: 0 }}>No tienes accesos rápidos visibles. Pulsa «Personalizar» para elegirlos.</p>)}
      {!ready && <div className="home-quick-skel" aria-hidden="true" />}
      {editing && ids && (
        <div className="card home-quick-edit" id="home-quick-edit">
          <p className="muted small" style={{ margin: 0 }}>Elige qué accesos ver y su orden. Se guardan en este dispositivo para tu cuenta.</p>
          <ul aria-label="Accesos visibles">
            {shown.map((id, i) => { const q = byId.get(id)!; return (
              <li key={id}>
                <span className="home-quick-ic sm" style={{ background: q.color }}><q.icon size={18} aria-hidden="true" /></span>
                <span className="grow"><b>{q.label}</b><span className="s">{q.hint}</span></span>
                <button type="button" className="home-icbtn" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Subir ${q.label}`}><ArrowUp size={18} /></button>
                <button type="button" className="home-icbtn" onClick={() => move(id, 1)} disabled={i === shown.length - 1} aria-label={`Bajar ${q.label}`}><ArrowDown size={18} /></button>
                <button type="button" className="home-icbtn" onClick={() => update((ids ?? []).filter((x) => x !== id))} aria-label={`Ocultar ${q.label}`}><EyeOff size={18} /></button>
              </li>
            ); })}
          </ul>
          {hidden.length > 0 && <>
            <span className="home-kicker">Ocultos</span>
            <ul aria-label="Accesos ocultos">
              {hidden.map((q) => (
                <li key={q.id} className="off">
                  <span className="home-quick-ic sm" style={{ background: q.color }}><q.icon size={18} aria-hidden="true" /></span>
                  <span className="grow"><b>{q.label}</b><span className="s">{q.hint}</span></span>
                  <button type="button" className="home-icbtn" onClick={() => update([...(ids ?? []), q.id])} aria-label={`Mostrar ${q.label}`}><Eye size={18} /></button>
                </li>
              ))}
            </ul>
          </>}
          <button type="button" className="acct-link small" style={{ justifySelf: "start" }} onClick={() => update([...DEFAULT_QUICK])}>Restablecer los de siempre</button>
        </div>
      )}
    </section>
  );
}

/**
 * Mapa del evento actual, solo con coordenadas cargadas por la parroquia. En orden: puntos de control (verde: llegada
 * registrada; azul: pendiente), si no el trayecto (A origen, B destino), si no el lugar del evento.
 */
function RouteMap({ current }: { current: Current }) {
  const { tools, journey, event: e } = current;
  const withProgress = tools.points && tools.checkin;
  const { points, title } = useMemo(() => {
    const cps: MapPoint[] = tools.points ? current.route.filter((r) => r.latitude != null && r.longitude != null)
      .map((r) => ({ id: r.checkpointId, order: r.order, name: r.name, lat: r.latitude!, lng: r.longitude!, color: withProgress && r.arrived ? "#18A957" : "#1677FF" })) : [];
    if (cps.length) return { points: cps, title: "Mapa del recorrido" };
    const ends: MapPoint[] = [];
    if (journey?.originLat != null && journey.originLng != null) ends.push({ id: "origen", order: 1, name: journey.originName ?? "Origen", lat: journey.originLat, lng: journey.originLng, label: "A", color: "#0B3158" });
    if (journey?.destinationLat != null && journey.destinationLng != null) ends.push({ id: "destino", order: 2, name: journey.destinationName ?? "Destino", lat: journey.destinationLat, lng: journey.destinationLng, label: "B", color: "#18A957" });
    if (ends.length) return { points: ends, title: "Mapa del trayecto" };
    if (e.place?.latitude != null && e.place.longitude != null) return { points: [{ id: "lugar", order: 1, name: e.place.name ?? "Lugar", lat: e.place.latitude, lng: e.place.longitude, label: "•", color: "#0B3158" }], title: "Lugar del evento" };
    return { points: [] as MapPoint[], title: "" };
  }, [current, tools.points, withProgress, journey, e.place]);
  if (!points.length) return null;
  const isCheckpoints = points[0].id !== "origen" && points[0].id !== "destino" && points[0].id !== "lugar";
  return (
    <section className="stack-sm" aria-labelledby="home-map-t">
      <h2 className="home-h" id="home-map-t">{title}</h2>
      <div className="home-map">
        <MapView points={points} line={points.length > 1} />
        {isCheckpoints && withProgress && <div className="home-map-legend small"><span><i style={{ background: "#18A957" }} /> Completado</span><span><i style={{ background: "#1677FF" }} /> Pendiente</span></div>}
      </div>
    </section>
  );
}
