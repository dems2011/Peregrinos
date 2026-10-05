"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { EVENT_STATUSES, EVENT_STATUS_LABEL, EVENT_TYPES, EVENT_TYPE_INFO, EVENT_VISIBILITIES, EVENT_VISIBILITY_LABEL, type EventType } from "@peregrinos/shared";
import { ApiError, patch } from "@/lib/api";
import { useApp } from "@/components/AppContext";
import { NewEventModal } from "@/components/NewEventModal";
import { ErrorBox, Page } from "@/components/ui";
import type { EventItem, EventRoute } from "@/lib/types";

const toLocal = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const fromLocal = (s: string) => (s ? new Date(s).toISOString() : null);
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

const ROUTE_KEYS = ["originName", "originAddress", "originLat", "originLng", "destinationName", "destinationAddress", "destinationLat", "destinationLng", "distanceKm"] as const;
type RouteForm = Record<(typeof ROUTE_KEYS)[number], string>;
const routeForm = (r: EventRoute | null): RouteForm => Object.fromEntries(ROUTE_KEYS.map((k) => [k, str(r?.[k])])) as RouteForm;

const formOf = (e: EventItem) => ({
  type: e.type, name: e.name, description: e.description ?? "", parishName: e.parishName ?? "", status: e.status as string,
  startsAt: toLocal(e.startsAt), endsAt: toLocal(e.endsAt), locationName: e.locationName ?? "", address: e.address ?? "",
  latitude: str(e.latitude), longitude: str(e.longitude), capacity: str(e.capacity), visibility: e.visibility as string,
  registrationOpen: e.registrationOpen, registrationOpensAt: toLocal(e.registrationOpensAt), registrationClosesAt: toLocal(e.registrationClosesAt),
  registrationFee: e.registrationFee ?? "", paymentInstructions: e.paymentInstructions ?? "",
  certificateEnabled: e.certificateEnabled, certificatePhrase: e.certificatePhrase ?? "",
});

export default function EventoConfig() {
  const { event, reloadEvents, setEventId, can } = useApp();
  const [f, setF] = useState<ReturnType<typeof formOf> | null>(null);
  const [route, setRoute] = useState<RouteForm>(routeForm(null));
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false); const [creating, setCreating] = useState(false);
  useEffect(() => { if (event) { setF(formOf(event)); setRoute(routeForm(event.route)); } }, [event]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => f && setF({ ...f, [k]: e.target.value });
  const setR = (k: keyof RouteForm) => (e: React.ChangeEvent<HTMLInputElement>) => setRoute({ ...route, [k]: e.target.value });

  const hasRouteType = f ? EVENT_TYPE_INFO[f.type as EventType].hasRoute : false;
  const routeFilled = ROUTE_KEYS.some((k) => route[k].trim() !== "");
  const dropsRoute = !!event?.route && (!hasRouteType || !routeFilled);

  async function save() {
    if (!event || !f) return; setBusy(true); setErr(null); setOk(false);
    try {
      const routeBody = hasRouteType && routeFilled
        ? {
          originName: route.originName || null, originAddress: route.originAddress || null, originLat: num(route.originLat), originLng: num(route.originLng),
          destinationName: route.destinationName || null, destinationAddress: route.destinationAddress || null, destinationLat: num(route.destinationLat), destinationLng: num(route.destinationLng),
          distanceKm: num(route.distanceKm),
        }
        : event.route ? null : undefined;
      await patch(`/events/${event.id}`, {
        type: f.type, name: f.name, description: f.description || undefined, parishName: f.parishName || null, status: f.status,
        startsAt: new Date(f.startsAt).toISOString(), endsAt: fromLocal(f.endsAt),
        locationName: f.locationName || null, address: f.address || null, latitude: num(f.latitude), longitude: num(f.longitude),
        capacity: num(f.capacity), visibility: f.visibility,
        registrationOpen: f.registrationOpen, registrationOpensAt: fromLocal(f.registrationOpensAt), registrationClosesAt: fromLocal(f.registrationClosesAt),
        registrationFee: f.registrationFee === "" ? null : Number(f.registrationFee), paymentInstructions: f.paymentInstructions || null,
        certificateEnabled: f.certificateEnabled, certificatePhrase: f.certificatePhrase || null,
        ...(routeBody !== undefined ? { route: routeBody } : {}),
      });
      await reloadEvents(); setOk(true);
    } catch (e) { setErr(e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : "No se pudo guardar."); } finally { setBusy(false); }
  }
  if (!can("event:update")) return <Page title="Evento" back="/configuracion"><div className="alert warn">Solo un superadministrador puede editar el evento.</div></Page>;

  return (
    <Page title="Evento e inscripción" back="/configuracion" action={<button className="ic" aria-label="Nuevo evento" onClick={() => setCreating(true)}><Plus size={24} /></button>}>
      {!event || !f ? <div className="empty">No hay eventos todavía.<button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setCreating(true)}>Crear el primer evento</button></div> : (
        <div className="card">
          <ErrorBox msg={err} />{ok && <div className="alert ok" style={{ marginBottom: 12 }}>Cambios guardados.</div>}
          <div className="grid2">
            <div className="field"><label htmlFor="et">Tipo de evento</label><select id="et" value={f.type} onChange={set("type")}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_INFO[t].label}</option>)}</select></div>
            <div className="field"><label htmlFor="es">Estado</label><select id="es" value={f.status} onChange={set("status")}>{EVENT_STATUSES.map((s) => <option key={s} value={s}>{EVENT_STATUS_LABEL[s]}</option>)}</select></div>
          </div>
          {!hasRouteType && event._count.checkpoints > 0 && <div className="alert warn" style={{ marginBottom: 12 }}>Este tipo de evento no muestra el recorrido. Sus {event._count.checkpoints} puntos y sus llegadas se conservan.</div>}
          <div className="field"><label htmlFor="en">Nombre del evento</label><input id="en" value={f.name} onChange={set("name")} /></div>
          <div className="field"><label htmlFor="ep">Nombre de la parroquia (se imprime en la credencial)</label><input id="ep" value={f.parishName} onChange={set("parishName")} placeholder="Ej: Parroquia Nuestra Señora de Luján" /></div>
          <div className="grid2">
            <div className="field"><label htmlFor="ed">Inicio</label><input id="ed" type="datetime-local" value={f.startsAt} onChange={set("startsAt")} /></div>
            <div className="field"><label htmlFor="ee">Finalización (opcional)</label><input id="ee" type="datetime-local" value={f.endsAt} onChange={set("endsAt")} /></div>
          </div>
          <div className="field"><label htmlFor="ex">Descripción</label><textarea id="ex" value={f.description} onChange={set("description")} /></div>

          <h3 style={{ margin: "8px 0" }}>Lugar</h3>
          <div className="grid2">
            <div className="field"><label htmlFor="ln">Nombre del lugar</label><input id="ln" value={f.locationName} onChange={set("locationName")} placeholder="Ej: Templo parroquial" /></div>
            <div className="field"><label htmlFor="la">Dirección</label><input id="la" value={f.address} onChange={set("address")} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label htmlFor="lt">Latitud (opcional)</label><input id="lt" inputMode="decimal" value={f.latitude} onChange={set("latitude")} /></div>
            <div className="field"><label htmlFor="lg">Longitud (opcional)</label><input id="lg" inputMode="decimal" value={f.longitude} onChange={set("longitude")} /></div>
          </div>

          {hasRouteType && <>
            <h3 style={{ margin: "8px 0" }}>Trayecto</h3>
            <div className="grid2">
              <div className="field"><label htmlFor="ro">Origen</label><input id="ro" value={route.originName} onChange={setR("originName")} /></div>
              <div className="field"><label htmlFor="rd">Destino</label><input id="rd" value={route.destinationName} onChange={setR("destinationName")} /></div>
            </div>
            <div className="grid2">
              <div className="field"><label htmlFor="roa">Dirección de origen</label><input id="roa" value={route.originAddress} onChange={setR("originAddress")} /></div>
              <div className="field"><label htmlFor="rda">Dirección de destino</label><input id="rda" value={route.destinationAddress} onChange={setR("destinationAddress")} /></div>
            </div>
            <div className="grid2">
              <div className="field"><label htmlFor="rol">Origen: latitud, longitud</label><div style={{ display: "flex", gap: 8 }}><input id="rol" aria-label="Latitud de origen" inputMode="decimal" value={route.originLat} onChange={setR("originLat")} /><input aria-label="Longitud de origen" inputMode="decimal" value={route.originLng} onChange={setR("originLng")} /></div></div>
              <div className="field"><label htmlFor="rdl">Destino: latitud, longitud</label><div style={{ display: "flex", gap: 8 }}><input id="rdl" aria-label="Latitud de destino" inputMode="decimal" value={route.destinationLat} onChange={setR("destinationLat")} /><input aria-label="Longitud de destino" inputMode="decimal" value={route.destinationLng} onChange={setR("destinationLng")} /></div></div>
            </div>
            <div className="field"><label htmlFor="rk">Distancia (km)</label><input id="rk" inputMode="decimal" value={route.distanceKm} onChange={setR("distanceKm")} /></div>
          </>}
          {dropsRoute && <div className="alert warn" style={{ marginBottom: 12 }}>Al guardar se quitará el trayecto cargado (origen y destino).</div>}

          <h3 style={{ margin: "8px 0" }}>Participación y visibilidad</h3>
          <div className="grid2">
            <div className="field"><label htmlFor="vc">Capacidad (informativa)</label><input id="vc" inputMode="numeric" value={f.capacity} onChange={set("capacity")} /></div>
            <div className="field"><label htmlFor="vv">Visibilidad</label><select id="vv" value={f.visibility} onChange={set("visibility")}>{EVENT_VISIBILITIES.map((v) => <option key={v} value={v}>{EVENT_VISIBILITY_LABEL[v]}</option>)}</select></div>
          </div>

          <h3 style={{ margin: "8px 0" }}>Inscripción y pago</h3>
          <label className="check"><input type="checkbox" checked={f.registrationOpen} onChange={(e) => setF({ ...f, registrationOpen: e.target.checked })} /> Inscripción abierta (las personas se registran con un enlace)</label>
          <div className="grid2">
            <div className="field"><label htmlFor="ro2">Abre (opcional)</label><input id="ro2" type="datetime-local" value={f.registrationOpensAt} onChange={set("registrationOpensAt")} /></div>
            <div className="field"><label htmlFor="rc2">Cierra (opcional)</label><input id="rc2" type="datetime-local" value={f.registrationClosesAt} onChange={set("registrationClosesAt")} /></div>
          </div>
          <div className="field"><label htmlFor="ef">Monto de inscripción (ARS)</label><input id="ef" inputMode="decimal" value={f.registrationFee} onChange={set("registrationFee")} /></div>
          <div className="field"><label htmlFor="ei">Instrucciones de pago (alias, CBU, titular…)</label><textarea id="ei" value={f.paymentInstructions} onChange={set("paymentInstructions")} /></div>

          <h3 style={{ margin: "8px 0" }}>Certificado</h3>
          <label className="check"><input type="checkbox" checked={f.certificateEnabled} onChange={(e) => setF({ ...f, certificateEnabled: e.target.checked })} /> Este evento ofrece certificado de participación</label>
          {f.certificateEnabled && <div className="field"><label htmlFor="cp">Frase del certificado (opcional)</label><textarea id="cp" value={f.certificatePhrase} onChange={set("certificatePhrase")} placeholder="Ej: Por haber caminado junto a María hasta su casa" /></div>}

          <button className="btn btn-primary" onClick={save} disabled={busy || !f.name.trim()}>{busy ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      )}
      {creating && <NewEventModal onClose={() => setCreating(false)} onCreated={async (id) => { await reloadEvents(); setEventId(id); setCreating(false); }} />}
    </Page>
  );
}
