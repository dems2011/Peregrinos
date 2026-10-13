"use client";
import { useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { SCHEDULE_KINDS, SCHEDULE_KIND_LABEL, WEEKDAY_LABEL, type ScheduleKind } from "@peregrinos/shared";
import { api, del, post, put } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useLoad } from "@/lib/hooks";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";

interface Item { id: string; kind: ScheduleKind; title: string; weekday: number | null; date: string | null; startTime: string; endTime: string | null; location: string | null; notes: string | null; active: boolean }
const empty = { kind: "MASS" as ScheduleKind, title: "", repeat: "weekly" as "weekly" | "once", weekday: 0, date: "", startTime: "", endTime: "", location: "", notes: "", active: true };

/**
 * B5 — Agenda pastoral y litúrgica (permiso agenda:manage). Actividades habituales de la parroquia, distintas de los
 * eventos especiales y peregrinaciones (que siguen en Eventos, con inscripción y check-in). Se ve en el perfil público.
 */
export default function Agenda() {
  const { can } = useApp();
  const list = useLoad(() => api<{ timezone: string; items: Item[] }>("/organization/agenda"), []);
  const [f, setF] = useState(empty); const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can("agenda:manage")) return <Page title="Agenda pastoral" back="/configuracion"><div className="alert warn">No tienes permiso para gestionar la agenda.</div></Page>;
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = {
      kind: f.kind, title: f.title, weekday: f.repeat === "weekly" ? Number(f.weekday) : null, date: f.repeat === "once" ? f.date : null,
      startTime: f.startTime, endTime: f.endTime || null, location: f.location || null, notes: f.notes || null, active: f.active,
    };
    try { if (editing) await put(`/organization/agenda/${editing}`, body); else await post("/organization/agenda", body); setF(empty); setEditing(null); await list.reload(); }
    catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
  };
  const edit = (i: Item) => {
    setEditing(i.id);
    setF({ kind: i.kind, title: i.title, repeat: i.weekday != null ? "weekly" : "once", weekday: i.weekday ?? 0, date: i.date?.slice(0, 10) ?? "", startTime: i.startTime, endTime: i.endTime ?? "", location: i.location ?? "", notes: i.notes ?? "", active: i.active });
    window.scrollTo(0, 0);
  };
  const items = list.data?.items ?? [];

  return (
    <Page title="Agenda pastoral" back="/configuracion">
      <ErrorBox msg={err ?? list.error} />
      <form className="card stack-sm" onSubmit={save}>
        <h2>{editing ? "Editar actividad" : "Nueva actividad"}</h2>
        <div className="field"><label htmlFor="ak">Tipo</label><select id="ak" value={f.kind} onChange={set("kind")}>{SCHEDULE_KINDS.map((k) => <option key={k} value={k}>{SCHEDULE_KIND_LABEL[k]}</option>)}</select></div>
        <div className="field"><label htmlFor="at">Título</label><input id="at" value={f.title} maxLength={120} onChange={set("title")} placeholder="Misa dominical" /></div>
        <div className="field"><label>¿Cuándo?</label>
          <label className="check"><input type="radio" name="rep" checked={f.repeat === "weekly"} onChange={() => setF({ ...f, repeat: "weekly" })} /> Todas las semanas</label>
          <label className="check"><input type="radio" name="rep" checked={f.repeat === "once"} onChange={() => setF({ ...f, repeat: "once" })} /> Un día puntual</label>
        </div>
        {f.repeat === "weekly"
          ? <div className="field"><label htmlFor="aw">Día</label><select id="aw" value={f.weekday} onChange={set("weekday")}>{WEEKDAY_LABEL.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></div>
          : <div className="field"><label htmlFor="ad">Fecha</label><input id="ad" type="date" value={f.date} onChange={set("date")} /></div>}
        <div className="grid2">
          <div className="field"><label htmlFor="as">Hora de inicio</label><input id="as" type="time" value={f.startTime} onChange={set("startTime")} /></div>
          <div className="field"><label htmlFor="ae">Hora de fin (opcional)</label><input id="ae" type="time" value={f.endTime} onChange={set("endTime")} /></div>
        </div>
        <div className="field"><label htmlFor="al">Lugar (opcional)</label><input id="al" value={f.location} maxLength={160} onChange={set("location")} placeholder="Templo principal" /></div>
        <div className="field"><label htmlFor="an">Notas (opcional)</label><input id="an" value={f.notes} maxLength={500} onChange={set("notes")} /></div>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Visible en el perfil</label>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy || f.title.trim().length < 2 || !f.startTime || (f.repeat === "once" && !f.date)}>{editing ? "Guardar cambios" : "Agregar a la agenda"}</button>
          {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setF(empty); }}>Cancelar</button>}
        </div>
      </form>

      <div className="sec-title">Agenda {list.data ? `(zona horaria: ${list.data.timezone})` : ""}</div>
      {list.loading && !list.data ? <Loading /> : (
        <div className="card flat">
          {!items.length && <div className="empty">La agenda está vacía.</div>}
          {items.map((i) => (
            <div key={i.id} className="list-item" style={{ cursor: "default", opacity: i.active ? 1 : .55 }}>
              <span className="grow"><span className="t">{i.title}</span> <span className="pill gray">{SCHEDULE_KIND_LABEL[i.kind]}</span><br />
                <span className="s">{i.weekday != null ? `Cada ${WEEKDAY_LABEL[i.weekday].toLowerCase()}` : i.date?.slice(0, 10)} · {i.startTime}{i.endTime ? `–${i.endTime}` : ""}{i.location ? ` · ${i.location}` : ""}{i.active ? "" : " · oculta"}</span></span>
              <button className="btn btn-sm" aria-label={`Editar ${i.title}`} onClick={() => edit(i)}><Pencil size={16} /></button>
              <button className="btn btn-sm" aria-label={`Borrar ${i.title}`} onClick={async () => { if (!confirm(`¿Borrar «${i.title}» de la agenda?`)) return; try { await del(`/organization/agenda/${i.id}`); await list.reload(); } catch (e) { setErr(errMsg(e)); } }}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
