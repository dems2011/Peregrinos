"use client";
import { useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Search } from "lucide-react";
import {
  INVENTORY_CATEGORIES, INVENTORY_CATEGORY_LABEL, INVENTORY_CONDITIONS, INVENTORY_CONDITION_LABEL, type InventoryCategory, type InventoryCondition,
} from "@peregrinos/shared";
import { api, post, put, qs } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useDebounced, useLoad } from "@/lib/hooks";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Modal, Page } from "@/components/ui";

interface Item { id: string; name: string; category: InventoryCategory; description: string | null; location: string | null; condition: InventoryCondition; quantity: number; acquiredAt: string | null; responsible: string | null; notes: string | null; archivedAt: string | null }
const empty = { name: "", category: "FURNITURE" as InventoryCategory, description: "", location: "", condition: "GOOD" as InventoryCondition, quantity: "1", acquiredAt: "", responsible: "", notes: "" };

/** B5 — Inventario parroquial (permiso inventory:manage). Registro de bienes; no es contabilidad. Baja = archivar. */
export default function Inventario() {
  const { can } = useApp();
  const [q, setQ] = useState(""); const dq = useDebounced(q.trim(), 300);
  const [category, setCategory] = useState(""); const [archived, setArchived] = useState(false);
  const list = useLoad(() => api<{ items: Item[] }>(`/organization/inventory${qs({ q: dq || undefined, category: category || undefined, archived: archived ? "true" : undefined })}`), [dq, category, archived]);
  const [form, setForm] = useState<{ id: string | null; f: typeof empty } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!can("inventory:manage")) return <Page title="Inventario" back="/configuracion"><div className="alert warn">No tienes permiso para gestionar el inventario.</div></Page>;

  return (
    <Page title="Inventario" back="/configuracion" action={<button className="ic" aria-label="Agregar bien" onClick={() => setForm({ id: null, f: empty })}><Plus size={24} /></button>}>
      <ErrorBox msg={err ?? list.error} />
      <button className="btn btn-primary" onClick={() => setForm({ id: null, f: empty })}><Plus size={18} /> Agregar bien</button>
      <div className="search"><Search size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, lugar o responsable" aria-label="Buscar en el inventario" /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="ic">Categoría</label><select id="ic" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Todas</option>{INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{INVENTORY_CATEGORY_LABEL[c]}</option>)}</select></div>
        <label className="check" style={{ alignSelf: "end" }}><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Ver dados de baja</label>
      </div>
      {list.loading && !list.data ? <Loading /> : (
        <div className="card flat">
          {!list.data?.items.length && <div className="empty">{dq || category ? "Nada coincide con la búsqueda." : archived ? "No hay bienes dados de baja." : "Todavía no cargaste bienes."}</div>}
          {list.data?.items.map((i) => (
            <div key={i.id} className="list-item" style={{ cursor: "default" }}>
              <span className="grow"><span className="t">{i.name}{i.quantity > 1 ? ` ×${i.quantity}` : ""}</span><br />
                <span className="s">{INVENTORY_CATEGORY_LABEL[i.category]} · {INVENTORY_CONDITION_LABEL[i.condition]}{i.location ? ` · ${i.location}` : ""}{i.responsible ? ` · ${i.responsible}` : ""}</span></span>
              <button className="btn btn-sm" aria-label={`Editar ${i.name}`} onClick={() => setForm({ id: i.id, f: { name: i.name, category: i.category, description: i.description ?? "", location: i.location ?? "", condition: i.condition, quantity: String(i.quantity), acquiredAt: i.acquiredAt?.slice(0, 10) ?? "", responsible: i.responsible ?? "", notes: i.notes ?? "" } })}><Pencil size={16} /></button>
              <button className="btn btn-sm" aria-label={i.archivedAt ? `Reincorporar ${i.name}` : `Dar de baja ${i.name}`} onClick={async () => {
                if (!i.archivedAt && !confirm(`¿Dar de baja «${i.name}»? Queda en el registro como dado de baja.`)) return;
                try { await post(`/organization/inventory/${i.id}/archive`, { archived: !i.archivedAt }); await list.reload(); } catch (e) { setErr(errMsg(e)); }
              }}>{i.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button>
            </div>
          ))}
        </div>
      )}
      {form && <ItemModal init={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); void list.reload(); }} />}
    </Page>
  );
}

function ItemModal({ init, onClose, onSaved }: { init: { id: string | null; f: typeof empty }; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(init.f); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = { name: f.name, category: f.category, description: f.description || null, location: f.location || null, condition: f.condition, quantity: Number(f.quantity) || 1, acquiredAt: f.acquiredAt || null, responsible: f.responsible || null, notes: f.notes || null };
    try { if (init.id) await put(`/organization/inventory/${init.id}`, body); else await post("/organization/inventory", body); onSaved(); }
    catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <Modal title={init.id ? "Editar bien" : "Agregar bien"} onClose={onClose}>
      <form className="stack-sm" onSubmit={save}>
        <ErrorBox msg={err} />
        <div className="field"><label htmlFor="in">Nombre</label><input id="in" value={f.name} maxLength={120} onChange={set("name")} /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="icat">Categoría</label><select id="icat" value={f.category} onChange={set("category")}>{INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{INVENTORY_CATEGORY_LABEL[c]}</option>)}</select></div>
          <div className="field"><label htmlFor="icond">Estado</label><select id="icond" value={f.condition} onChange={set("condition")}>{INVENTORY_CONDITIONS.map((c) => <option key={c} value={c}>{INVENTORY_CONDITION_LABEL[c]}</option>)}</select></div>
        </div>
        <div className="grid2">
          <div className="field"><label htmlFor="iq">Cantidad</label><input id="iq" type="number" min={1} value={f.quantity} onChange={set("quantity")} /></div>
          <div className="field"><label htmlFor="ia">Incorporado el (opcional)</label><input id="ia" type="date" value={f.acquiredAt} onChange={set("acquiredAt")} /></div>
        </div>
        <div className="field"><label htmlFor="il">Ubicación</label><input id="il" value={f.location} maxLength={160} onChange={set("location")} placeholder="Salón parroquial" /></div>
        <div className="field"><label htmlFor="ir">Responsable</label><input id="ir" value={f.responsible} maxLength={120} onChange={set("responsible")} /></div>
        <div className="field"><label htmlFor="idsc">Descripción</label><textarea id="idsc" value={f.description} maxLength={1000} onChange={set("description")} /></div>
        <div className="field"><label htmlFor="ino">Notas</label><input id="ino" value={f.notes} maxLength={1000} onChange={set("notes")} /></div>
        <button className="btn btn-primary" disabled={busy || f.name.trim().length < 2}>{busy ? "Guardando…" : "Guardar"}</button>
      </form>
    </Modal>
  );
}
