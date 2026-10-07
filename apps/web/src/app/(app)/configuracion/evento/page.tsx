"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  EVENT_CAPABILITY_LABEL, EVENT_CAPABILITY_REQUIRES, EVENT_STATUS_LABEL, EVENT_TRANSITIONS, EVENT_TYPES, EVENT_TYPE_INFO,
  EVENT_VISIBILITIES, EVENT_VISIBILITY_LABEL, IMPLEMENTED_EVENT_CAPABILITIES, REGISTRATION_STATE_LABEL,
  type EventCapability, type EventStatus,
} from "@peregrinos/shared";
import { ApiError, patch } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { NewEventModal } from "@/components/NewEventModal";
import { ErrorBox, Page } from "@/components/ui";
import type { EventItem, EventRoute } from "@/lib/types";

import { fromZonedInput, toZonedInput } from "@/lib/format";

// Las fechas del evento se editan en la zona horaria del evento (Event.timezone), no en la del navegador.
const toLocal = (iso: string | null, zone: string | null) => toZonedInput(iso, zone);
const fromLocal = (s: string, zone: string | null) => fromZonedInput(s, zone);
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

const ROUTE_KEYS = ["originName", "originAddress", "originLat", "originLng", "destinationName", "destinationAddress", "destinationLat", "destinationLng", "distanceKm"] as const;
type RouteForm = Record<(typeof ROUTE_KEYS)[number], string>;
const routeForm = (r: EventRoute | null): RouteForm => Object.fromEntries(ROUTE_KEYS.map((k) => [k, str(r?.[k])])) as RouteForm;

/** A4: INFO siempre está activa; el resto se elige por evento. */
const SELECTABLE = IMPLEMENTED_EVENT_CAPABILITIES.filter((c) => c !== "INFO");

/**
 * A4: una capacidad con datos guardados no se puede desactivar (la API responde 409 y no borra nada).
 * Aquí se bloquean las casillas cuyos datos ya conoce la pantalla; el resto lo valida el servidor.
 */
function lockedReason(e: EventItem, c: EventCapability): string | null {
  const loc = e.locationName != null || e.address != null || e.latitude != null || e.longitude != null;
  const has: Partial<Record<EventCapability, boolean>> = {
    LOCATION: loc, ROUTE: !!e.route, CERTIFICATES: e.certificateEnabled || e.certificatePhrase != null,
    PARTICIPANTS: e._count.participants > 0, POINTS: e._count.checkpoints > 0, CHECKIN: e._count.checkins > 0,
  };
  return e.capabilities.includes(c) && has[c] ? "Tiene datos: quítalos antes de desactivar." : null;
}

/** Activar una capacidad suma las que necesita; desactivarla quita las que dependen de ella. */
function toggleCapability(caps: EventCapability[], c: EventCapability, on: boolean): EventCapability[] {
  const next = new Set(caps);
  if (on) { next.add(c); for (const r of EVENT_CAPABILITY_REQUIRES[c] ?? []) next.add(r); }
  else {
    next.delete(c);
    for (const [k, reqs] of Object.entries(EVENT_CAPABILITY_REQUIRES)) if (reqs?.includes(c)) next.delete(k as EventCapability);
  }
  return IMPLEMENTED_EVENT_CAPABILITIES.filter((x) => next.has(x));
}

const formOf = (e: EventItem) => ({
  type: e.type, name: e.name, description: e.description ?? "", parishName: e.parishName ?? "", status: e.status as string,
  startsAt: toLocal(e.startsAt, e.timezone), endsAt: toLocal(e.endsAt, e.timezone), locationName: e.locationName ?? "", address: e.address ?? "",
  latitude: str(e.latitude), longitude: str(e.longitude), capacity: str(e.capacity), visibility: e.visibility as string,
  registrationOpen: e.registrationOpen, registrationOpensAt: toLocal(e.registrationOpensAt, e.timezone), registrationClosesAt: toLocal(e.registrationClosesAt, e.timezone),
  registrationFee: e.registrationFee ?? "", paymentInstructions: e.paymentInstructions ?? "",
  certificateEnabled: e.certificateEnabled, certificatePhrase: e.certificatePhrase ?? "",
  capabilities: e.capabilities,
});

export default function EventoConfig() {
  const { event, reloadEvents, setEventId, can } = useApp();
  const [f, setF] = useState<ReturnType<typeof formOf> | null>(null);
  const [route, setRoute] = useState<RouteForm>(routeForm(null));
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false); const [creating, setCreating] = useState(false);
  // Solo al cambiar de evento: la lista se recarga en vivo (llegadas, altas) y no debe pisar lo que se está editando.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (event) { setF(formOf(event)); setRoute(routeForm(event.route)); } }, [event?.id]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => f && setF({ ...f, [k]: e.target.value });
  const setR = (k: keyof RouteForm) => (e: React.ChangeEvent<HTMLInputElement>) => setRoute({ ...route, [k]: e.target.value });

  const has = (c: EventCapability) => !!f?.capabilities.includes(c);
  const routeFilled = ROUTE_KEYS.some((k) => route[k].trim() !== "");
  const dropsRoute = !!event?.route && has("ROUTE") && !routeFilled;
  // Estado: el actual y solo las transiciones permitidas desde él.
  const statusOptions: EventStatus[] = event ? [event.status, ...EVENT_TRANSITIONS[event.status]] : [];

  async function save() {
    if (!event || !f) return; setBusy(true); setErr(null); setOk(false);
    try {
      // El trayecto solo se edita con ROUTE activa; quitarlo es una edición explícita (se avisa antes).
      const routeBody = !has("ROUTE") ? undefined : routeFilled
        ? {
          originName: route.originName || null, originAddress: route.originAddress || null, originLat: num(route.originLat), originLng: num(route.originLng),
          destinationName: route.destinationName || null, destinationAddress: route.destinationAddress || null, destinationLat: num(route.destinationLat), destinationLng: num(route.destinationLng),
          distanceKm: num(route.distanceKm),
        }
        : event.route ? null : undefined;
      // A4: desactivar una sección nunca vacía sus datos; si los tiene, la API responde 409 y no cambia nada.
      await patch(`/events/${event.id}`, {
        type: f.type, name: f.name, description: f.description /* "" permite borrarla (la API no acepta null) */, parishName: f.parishName || null,
        ...(f.status !== event.status ? { status: f.status } : {}),
        capabilities: ["INFO", ...f.capabilities.filter((c) => c !== "INFO")],
        startsAt: fromLocal(f.startsAt, event.timezone), endsAt: fromLocal(f.endsAt, event.timezone),
        locationName: f.locationName || null, address: f.address || null, latitude: num(f.latitude), longitude: num(f.longitude),
        capacity: num(f.capacity), visibility: f.visibility,
        // El interruptor es configuración, no datos: sin REGISTRATION se envía apagado.
        registrationOpen: has("REGISTRATION") && f.registrationOpen,
        registrationOpensAt: fromLocal(f.registrationOpensAt, event.timezone), registrationClosesAt: fromLocal(f.registrationClosesAt, event.timezone),
        registrationFee: f.registrationFee === "" ? null : Number(f.registrationFee), paymentInstructions: f.paymentInstructions || null,
        certificateEnabled: f.certificateEnabled, certificatePhrase: f.certificatePhrase || null,
        ...(routeBody !== undefined ? { route: routeBody } : {}),
      });
      await reloadEvents(); setOk(true);
    } catch (e) { setErr(e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : "No se pudo guardar."); } finally { setBusy(false); }
  }
  if (!can("event:update")) return <Page title="Evento" back="/configuracion"><div className="alert warn">Solo un superadministrador puede editar el evento.</div></Page>;

  return (
    <Page title="Evento e inscripción" back="/configuracion" action={can("event:create") ? <button className="ic" aria-label="Nuevo evento" onClick={() => setCreating(true)}><Plus size={24} /></button> : undefined}>
      {!event || !f ? <div className="empty">No hay eventos todavía.{can("event:create") && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setCreating(true)}>Crear el primer evento</button>}</div> : (
        <div className="card">
          <ErrorBox msg={err} />{ok && <div className="alert ok" style={{ marginBottom: 12 }}>Cambios guardados.</div>}
          <div className="grid2">
            <div className="field"><label htmlFor="et">Tipo de evento</label><select id="et" value={f.type} onChange={set("type")}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_INFO[t].label}</option>)}</select></div>
            <div className="field"><label htmlFor="es">Estado</label><select id="es" value={f.status} onChange={set("status")} disabled={statusOptions.length < 2}>{statusOptions.map((s) => <option key={s} value={s}>{EVENT_STATUS_LABEL[s]}</option>)}</select></div>
          </div>
          <div className="field"><label htmlFor="en">Nombre del evento</label><input id="en" value={f.name} onChange={set("name")} /></div>
          <div className="field"><label htmlFor="ep">Nombre de la parroquia (se imprime en la credencial)</label><input id="ep" value={f.parishName} onChange={set("parishName")} placeholder="Ej: Parroquia Nuestra Señora de Luján" /></div>
          <div className="grid2">
            <div className="field"><label htmlFor="ed">Inicio</label><input id="ed" type="datetime-local" value={f.startsAt} onChange={set("startsAt")} /></div>
            <div className="field"><label htmlFor="ee">Finalización (opcional)</label><input id="ee" type="datetime-local" value={f.endsAt} onChange={set("endsAt")} /></div>
          </div>
          <div className="field"><label htmlFor="ex">Descripción</label><textarea id="ex" value={f.description} onChange={set("description")} /></div>

          <h3 style={{ margin: "8px 0" }}>Qué usa este evento</h3>
          <p className="muted" style={{ marginTop: 0 }}>El tipo de evento no limita estas opciones. Una sección con datos no se puede desactivar: primero hay que quitar sus datos. Nunca se borra nada al desactivar.</p>
          <div className="grid2">
            {SELECTABLE.map((c) => {
              const locked = lockedReason(event, c);
              return (
                <label key={c} className="check" title={locked ?? undefined}>
                  <input type="checkbox" checked={has(c)} disabled={!!locked} onChange={(e) => setF({ ...f, capabilities: toggleCapability(f.capabilities, c, e.target.checked) })} /> {EVENT_CAPABILITY_LABEL[c]}{locked && <span className="muted"> · con datos</span>}
                </label>
              );
            })}
          </div>

          {has("LOCATION") && <>
            <h3 style={{ margin: "8px 0" }}>Lugar</h3>
            <div className="grid2">
              <div className="field"><label htmlFor="ln">Nombre del lugar</label><input id="ln" value={f.locationName} onChange={set("locationName")} placeholder="Ej: Templo parroquial" /></div>
              <div className="field"><label htmlFor="la">Dirección</label><input id="la" value={f.address} onChange={set("address")} /></div>
            </div>
          </>}

          {has("ROUTE") && <>
            <h3 style={{ margin: "8px 0" }}>Trayecto</h3>
            <div className="grid2">
              <div className="field"><label htmlFor="ro">Origen</label><input id="ro" value={route.originName} onChange={setR("originName")} /></div>
              <div className="field"><label htmlFor="rd">Destino</label><input id="rd" value={route.destinationName} onChange={setR("destinationName")} /></div>
            </div>
            <div className="grid2">
              <div className="field"><label htmlFor="roa">Dirección de origen</label><input id="roa" value={route.originAddress} onChange={setR("originAddress")} /></div>
              <div className="field"><label htmlFor="rda">Dirección de destino</label><input id="rda" value={route.destinationAddress} onChange={setR("destinationAddress")} /></div>
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>Los puntos de control del recorrido se cargan en «Recorrido» de este evento (con su ubicación en el mapa).</p>
          </>}
          {dropsRoute && <div className="alert warn" style={{ marginBottom: 12 }}>Al guardar se quitará el trayecto cargado (origen y destino).</div>}

          <h3 style={{ margin: "8px 0" }}>Cupo</h3>
          <div className="field">
            <label htmlFor="vc">Cupo máximo de peregrinos</label>
            <input id="vc" inputMode="numeric" value={f.capacity} onChange={set("capacity")} placeholder="Sin límite" />
            <span className="hint">Cuando los peregrinos confirmados llegan a este número, la inscripción se cierra sola y no se aprueban más. Vacío: sin límite.</span>
          </div>

          <h3 style={{ margin: "8px 0" }}>Visibilidad</h3>
          <div className="field">
            <label htmlFor="vv">¿Quién puede ver este evento?</label>
            <select id="vv" value={f.visibility} onChange={set("visibility")}>{EVENT_VISIBILITIES.map((v) => <option key={v} value={v}>{EVENT_VISIBILITY_LABEL[v]}</option>)}</select>
            <span className="hint">Solo los eventos públicos y publicados (o en curso) aparecen en el perfil de la parroquia y notifican a sus seguidores.</span>
          </div>

          {has("REGISTRATION") && <>
            <h3 style={{ margin: "8px 0" }}>Inscripción y pago</h3>
            <p className="muted" style={{ marginTop: 0 }}>Estado actual de la inscripción: <b>{REGISTRATION_STATE_LABEL[event.registrationState]}</b>. Depende del interruptor, de la ventana y de que el evento esté publicado o en curso; nunca cambia el estado del evento.</p>
            <label className="check"><input type="checkbox" checked={f.registrationOpen} onChange={(e) => setF({ ...f, registrationOpen: e.target.checked })} /> Inscripción abierta (las personas se registran con un enlace)</label>
            <div className="grid2">
              <div className="field"><label htmlFor="ro2">Abre (opcional)</label><input id="ro2" type="datetime-local" value={f.registrationOpensAt} onChange={set("registrationOpensAt")} /></div>
              <div className="field"><label htmlFor="rc2">Cierra (opcional)</label><input id="rc2" type="datetime-local" value={f.registrationClosesAt} onChange={set("registrationClosesAt")} /></div>
            </div>
            <div className="field"><label htmlFor="ef">Monto de inscripción (ARS)</label><input id="ef" inputMode="decimal" value={f.registrationFee} onChange={set("registrationFee")} /></div>
            <div className="field"><label htmlFor="ei">Instrucciones de pago (alias, CBU, titular…)</label><textarea id="ei" value={f.paymentInstructions} onChange={set("paymentInstructions")} /></div>
          </>}

          {has("CERTIFICATES") && <>
            <h3 style={{ margin: "8px 0" }}>Certificado</h3>
            <label className="check"><input type="checkbox" checked={f.certificateEnabled} onChange={(e) => setF({ ...f, certificateEnabled: e.target.checked })} /> Este evento ofrece certificado de participación</label>
            {f.certificateEnabled && <div className="field"><label htmlFor="cp">Frase del certificado (opcional)</label><textarea id="cp" value={f.certificatePhrase} onChange={set("certificatePhrase")} placeholder="Ej: Por haber caminado junto a María hasta su casa" /></div>}
          </>}

          <button className="btn btn-primary" onClick={save} disabled={busy || !f.name.trim()}>{busy ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      )}
      {creating && <NewEventModal onClose={() => setCreating(false)} onCreated={async (id) => { await reloadEvents(); setEventId(id); setCreating(false); }} />}
    </Page>
  );
}
