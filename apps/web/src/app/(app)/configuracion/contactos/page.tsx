"use client";
import { useState } from "react";
import { Phone, Plus, Siren } from "lucide-react";
import { api, ApiError, del, patch, post } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import type { Checkpoint } from "@/lib/types";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Modal, Page } from "@/components/ui";

interface Contact { id: string; name: string; roleLabel: string | null; phone: string; email: string | null; notes: string | null; checkpointId: string | null; isEmergency: boolean; sortOrder: number; checkpoint?: { name: string } | null }

export default function Contactos() {
  const { event } = useApp();
  const eid = event?.id;
  const list = useLoad(() => (eid ? api<{ items: Contact[] }>(`/events/${eid}/contacts`) : Promise.resolve(null)), [eid]);
  const cps = useLoad(() => (eid ? api<{ items: Checkpoint[] }>(`/events/${eid}/checkpoints`) : Promise.resolve(null)), [eid]);
  const [edit, setEdit] = useState<Contact | "new" | null>(null);
  return (
    <Page title="Contactos del evento" back="/evento" action={eid ? <button className="ic" aria-label="Agregar contacto" onClick={() => setEdit("new")}><Plus size={24} /></button> : undefined}>
      <p className="muted">Estas personas aparecen en la pestaña «Contactos» de la app del peregrino, con botón para llamar.</p>
      {!eid && <div className="empty">No hay un evento seleccionado.</div>}
      <ErrorBox msg={list.error} />
      <div className="card flat">
        {list.loading ? <Loading /> : !list.data?.items.length ? <div className="empty">Aún no hay contactos.</div> : list.data.items.map((c) => (
          <button key={c.id} className="list-item" onClick={() => setEdit(c)}>
            <span className="tile" style={{ background: c.isEmergency ? "#D94343" : "#1677FF" }}>{c.isEmergency ? <Siren size={24} /> : <Phone size={24} />}</span>
            <span className="grow"><span className="t">{c.name}</span><br /><span className="s">{[c.roleLabel, c.checkpoint?.name, c.phone].filter(Boolean).join(" · ")}</span></span>
          </button>
        ))}
      </div>
      {edit && <ContactModal c={edit === "new" ? null : edit} eid={eid!} cps={cps.data?.items ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </Page>
  );
}

function ContactModal({ c, eid, cps, onClose, onSaved }: { c: Contact | null; eid: string; cps: Checkpoint[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: c?.name ?? "", roleLabel: c?.roleLabel ?? "", phone: c?.phone ?? "", email: c?.email ?? "", checkpointId: c?.checkpointId ?? "", isEmergency: c?.isEmergency ?? false });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const body = () => ({ name: f.name, roleLabel: f.roleLabel.trim() /* "" permite borrar el cargo al editar */, phone: f.phone, email: f.email || undefined, checkpointId: f.checkpointId || null, isEmergency: f.isEmergency });
  return (
    <Modal title={c ? "Editar contacto" : "Nuevo contacto"} onClose={onClose}>
      <ErrorBox msg={err} />
      <div className="field"><label>Nombre</label><input value={f.name} onChange={set("name")} /></div>
      <div className="field"><label>Cargo o función</label><input value={f.roleLabel} onChange={set("roleLabel")} placeholder="Ej: Coordinador general" /></div>
      <div className="field"><label>Teléfono</label><input value={f.phone} onChange={set("phone")} inputMode="tel" /></div>
      <div className="field"><label>Correo (opcional)</label><input value={f.email} onChange={set("email")} inputMode="email" /></div>
      <div className="field"><label>Punto de control (opcional)</label><select value={f.checkpointId} onChange={set("checkpointId")}><option value="">Todo el recorrido</option>{cps.map((p) => <option key={p.id} value={p.id}>{p.order}. {p.name}</option>)}</select></div>
      <label className="check"><input type="checkbox" checked={f.isEmergency} onChange={(e) => setF({ ...f, isEmergency: e.target.checked })} /> Es contacto de emergencia (se muestra primero)</label>
      <button className="btn btn-primary" disabled={f.name.trim().length < 2 || f.phone.trim().length < 7} onClick={async () => { try { if (c) await patch(`/events/${eid}/contacts/${c.id}`, body()); else await post(`/events/${eid}/contacts`, body()); onSaved(); } catch (e) { setErr(e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : "No se pudo guardar."); } }}>Guardar</button>
      {c && <button className="btn btn-danger" onClick={async () => {
        if (!confirm("¿Eliminar este contacto?")) return;
        try { await del(`/events/${eid}/contacts/${c.id}`); onSaved(); }
        catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo eliminar."); }
      }}>Eliminar</button>}
    </Modal>
  );
}
