"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ScanLine } from "lucide-react";
import { api, ApiError, del, patch, post } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { avatarColor } from "@/lib/format";
import type { Checkpoint } from "@/lib/types";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="map" /> });
const empty = { name: "", description: "", address: "", reference: "", latitude: "", longitude: "", capacity: "", status: "ACTIVE" };

/** Detalle del punto de control + edición (id = "nuevo" para crear). */
export default function PuntoDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { event, can } = useApp();
  const eid = event?.id;
  const isNew = id === "nuevo";
  const manage = can("checkpoint:manage");
  const cp = useLoad(async () => (eid && !isNew ? (await api<{ items: Checkpoint[] }>(`/events/${eid}/checkpoints`)).items.find((c) => c.id === id) ?? null : null), [eid, id]);
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = cp.data; if (!c) return;
    setF({ name: c.name, description: c.description ?? "", address: c.address ?? "", reference: c.reference ?? "", latitude: c.latitude?.toString() ?? "", longitude: c.longitude?.toString() ?? "", capacity: c.capacity?.toString() ?? "", status: c.status });
  }, [cp.data]);

  if (!isNew && cp.loading) return <Page title="Punto de control" back="/recorrido"><Loading /></Page>;
  if (!isNew && !cp.data) return <Page title="Punto de control" back="/recorrido"><ErrorBox msg="No se encontró el punto." /></Page>;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const lat = f.latitude !== "" ? Number(f.latitude) : null, lng = f.longitude !== "" ? Number(f.longitude) : null;
  const hasPos = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = { name: f.name, description: f.description || undefined, address: f.address || undefined, reference: f.reference || undefined, latitude: hasPos ? lat : null, longitude: hasPos ? lng : null, capacity: f.capacity ? Number(f.capacity) : null, status: f.status };
    try { if (isNew) await post(`/events/${eid}/checkpoints`, body); else await patch(`/events/${eid}/checkpoints/${id}`, body); router.replace("/recorrido"); }
    catch (e2) { setErr(e2 instanceof ApiError ? (e2.details?.map((d) => d.message).join(". ") || e2.message) : "No se pudo guardar."); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm("¿Eliminar este punto de control? Solo es posible si no tiene llegadas registradas.")) return;
    try { await del(`/events/${eid}/checkpoints/${id}`); router.replace("/recorrido"); } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo eliminar."); }
  }
  const c = cp.data;

  return (
    <Page title={isNew ? "Nuevo punto de control" : "Detalle del punto de control"} back="/recorrido">
      {c && (
        <section className="card stack">
          <div className="row" style={{ justifyContent: "flex-start", gap: 14 }}><span className="avatar lg" style={{ background: avatarColor(c.order) }}>{c.order}</span><div><h2>{c.name}</h2><span className="muted">{c.address ?? ""}</span></div></div>
          <div className="row"><span className="muted">Personas presentes en este punto</span><b>{c.arrivals}{c.capacity ? ` / ${c.capacity}` : ""}</b></div>
          {c.capacity ? <div className="progress"><i style={{ width: `${c.percent ?? 0}%` }} /></div> : null}
          {can("checkin:create") && c.status === "ACTIVE" && <Link href="/registrar" onClick={() => { try { localStorage.setItem(`pg_cp_${eid}`, c.id); } catch { /* sin almacenamiento */ } }} className="btn btn-ok"><ScanLine size={20} /> Registrar llegada</Link>}
        </section>
      )}
      {hasPos && <MapView points={[{ id: id, order: c?.order ?? 0, name: f.name, lat: lat!, lng: lng!, color: avatarColor(c?.order ?? 1) }]} line={false} />}
      {manage && (
        <form className="card" onSubmit={save} noValidate>
          <h2 style={{ marginBottom: 12 }}>{isNew ? "Datos del punto" : "Editar punto"}</h2>
          <ErrorBox msg={err} />
          <div className="field"><label htmlFor="pn">Nombre <span className="req">*</span></label><input id="pn" value={f.name} onChange={set("name")} required /></div>
          <div className="field"><label htmlFor="pa">Dirección</label><input id="pa" value={f.address} onChange={set("address")} /></div>
          <div className="field"><label htmlFor="pr">Referencia</label><input id="pr" value={f.reference} onChange={set("reference")} placeholder="Ej: frente a la plaza" /></div>
          <div className="field"><label htmlFor="pd">Descripción</label><textarea id="pd" value={f.description} onChange={set("description")} /></div>
          <div className="grid2">
            <div className="field"><label htmlFor="la">Latitud</label><input id="la" inputMode="decimal" value={f.latitude} onChange={set("latitude")} placeholder="-34.6037" /></div>
            <div className="field"><label htmlFor="lo">Longitud</label><input id="lo" inputMode="decimal" value={f.longitude} onChange={set("longitude")} placeholder="-58.4421" /></div>
          </div>
          <p className="muted small" style={{ marginTop: -6 }}>Toca el mapa para fijar la ubicación.</p>
          <MapView points={[]} line={false} marker={hasPos ? { lat: lat!, lng: lng! } : null} onClick={(a, o) => setF((s) => ({ ...s, latitude: a.toFixed(6), longitude: o.toFixed(6) }))} />
          <div className="grid2" style={{ marginTop: 14 }}>
            <div className="field"><label htmlFor="pc">Capacidad estimada</label><input id="pc" inputMode="numeric" value={f.capacity} onChange={set("capacity")} /></div>
            <div className="field"><label htmlFor="ps">Estado</label><select id="ps" value={f.status} onChange={set("status")}><option value="ACTIVE">Activo</option><option value="INACTIVE">Desactivado</option></select></div>
          </div>
          <div className="btn-row"><button type="button" className="btn" onClick={() => router.back()}>Cancelar</button><button className="btn btn-primary" disabled={busy || !f.name.trim()}>{busy ? "Guardando…" : "Guardar"}</button></div>
          {!isNew && <button type="button" className="btn btn-danger" style={{ marginTop: 10 }} onClick={remove}>Eliminar punto</button>}
        </form>
      )}
    </Page>
  );
}
