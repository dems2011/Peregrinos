"use client";
import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { ClipboardCheck, Pencil, Trash2, UserPlus } from "lucide-react";
import { PASTORAL_GROUP_KIND_LABEL, type PastoralGroupKind } from "@peregrinos/shared";
import { api, del, post, put } from "@/lib/api";
import { errMsg } from "@/lib/errMsg";
import { useLoad } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Modal, Page } from "@/components/ui";

interface Member { id: string; name: string; phone: string | null; email: string | null; role: string | null; isMinor: boolean; guardianName: string | null; guardianPhone: string | null; active: boolean }
interface Meeting { id: string; date: string; topic: string | null; present: number; recorded: number; attendance: { memberId: string; present: boolean }[] }
interface Data { group: { id: string; name: string; kind: PastoralGroupKind; leaders: string | null; active: boolean }; members: Member[]; meetings: Meeting[] }
const emptyMember = { name: "", phone: "", email: "", role: "", isMinor: false, guardianName: "", guardianPhone: "", active: true };

/** B5 — Detalle de un grupo pastoral: miembros (menores con adulto responsable), encuentros y asistencia. */
export default function Grupo() {
  const { id } = useParams<{ id: string }>();
  const { can } = useApp();
  const d = useLoad(() => api<Data>(`/organization/groups/${id}`), [id]);
  const [member, setMember] = useState<{ id: string | null; f: typeof emptyMember } | null>(null);
  const [att, setAtt] = useState<Meeting | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [topic, setTopic] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!can("group:manage")) return <Page title="Grupo" back="/configuracion/grupos"><div className="alert warn">No tienes permiso para gestionar los grupos.</div></Page>;
  const g = d.data?.group;
  const active = d.data?.members.filter((m) => m.active) ?? [];

  return (
    <Page title={g?.name ?? "Grupo"} back="/configuracion/grupos">
      <ErrorBox msg={err ?? d.error} />
      {!d.data ? <Loading /> : (<>
        <p className="muted" style={{ margin: 0 }}>{PASTORAL_GROUP_KIND_LABEL[g!.kind]}{g!.leaders ? ` · Responsables: ${g!.leaders}` : ""}</p>

        <div className="sec-title">Miembros ({active.length})</div>
        <button className="btn" onClick={() => setMember({ id: null, f: emptyMember })}><UserPlus size={18} /> Agregar miembro</button>
        <div className="card flat">
          {!d.data.members.length && <div className="empty">Todavía no hay miembros.</div>}
          {d.data.members.map((m) => (
            <div key={m.id} className="list-item" style={{ cursor: "default", opacity: m.active ? 1 : .5 }}>
              <span className="grow"><span className="t">{m.name}</span>{m.isMinor && <span className="pill warn"> Menor</span>}{!m.active && <span className="pill gray"> Baja</span>}<br />
                <span className="s">{[m.role, m.isMinor && m.guardianName ? `Responsable: ${m.guardianName}${m.guardianPhone ? ` (${m.guardianPhone})` : ""}` : m.phone].filter(Boolean).join(" · ")}</span></span>
              <button className="btn btn-sm" aria-label={`Editar ${m.name}`} onClick={() => setMember({ id: m.id, f: { name: m.name, phone: m.phone ?? "", email: m.email ?? "", role: m.role ?? "", isMinor: m.isMinor, guardianName: m.guardianName ?? "", guardianPhone: m.guardianPhone ?? "", active: m.active } })}><Pencil size={16} /></button>
            </div>
          ))}
        </div>

        <div className="sec-title">Encuentros y asistencia</div>
        <form className="card stack-sm" onSubmit={async (e: FormEvent) => { e.preventDefault(); try { await post(`/organization/groups/${id}/meetings`, { date, topic: topic || null }); setTopic(""); await d.reload(); } catch (e2) { setErr(errMsg(e2)); } }}>
          <div className="grid2">
            <div className="field"><label htmlFor="md">Fecha</label><input id="md" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="field"><label htmlFor="mt">Tema (opcional)</label><input id="mt" value={topic} maxLength={160} onChange={(e) => setTopic(e.target.value)} /></div>
          </div>
          <button className="btn btn-primary" disabled={!date}>Agregar encuentro</button>
        </form>
        <div className="card flat">
          {!d.data.meetings.length && <div className="empty">Todavía no hay encuentros.</div>}
          {d.data.meetings.map((m) => (
            <div key={m.id} className="list-item" style={{ cursor: "default" }}>
              <span className="grow"><span className="t">{fmtDate(m.date)}{m.topic ? ` — ${m.topic}` : ""}</span><br />
                <span className="s">{m.recorded ? `${m.present} de ${m.recorded} presentes` : "Sin asistencia registrada"}</span></span>
              <button className="btn btn-sm" onClick={() => setAtt(m)}><ClipboardCheck size={16} /> Asistencia</button>
              <button className="btn btn-sm" aria-label="Borrar encuentro" onClick={async () => { if (!confirm("¿Borrar este encuentro y su asistencia?")) return; try { await del(`/organization/groups/${id}/meetings/${m.id}`); await d.reload(); } catch (e) { setErr(errMsg(e)); } }}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </>)}
      {member && <MemberModal groupId={id} init={member} onClose={() => setMember(null)} onSaved={() => { setMember(null); void d.reload(); }} />}
      {att && d.data && <AttendanceModal groupId={id} meeting={att} members={active} onClose={() => setAtt(null)} onSaved={() => { setAtt(null); void d.reload(); }} />}
    </Page>
  );
}

function MemberModal({ groupId, init, onClose, onSaved }: { groupId: string; init: { id: string | null; f: typeof emptyMember }; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(init.f); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof emptyMember) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={init.id ? "Editar miembro" : "Agregar miembro"} onClose={onClose}>
      <form className="stack-sm" onSubmit={async (e: FormEvent) => {
        e.preventDefault(); setBusy(true); setErr(null);
        const body = { name: f.name, phone: f.phone || null, email: f.email || null, role: f.role || null, isMinor: f.isMinor, guardianName: f.guardianName || null, guardianPhone: f.guardianPhone || null, active: f.active };
        try { if (init.id) await put(`/organization/groups/${groupId}/members/${init.id}`, body); else await post(`/organization/groups/${groupId}/members`, body); onSaved(); }
        catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
      }}>
        <ErrorBox msg={err} />
        <div className="field"><label htmlFor="mn">Nombre</label><input id="mn" value={f.name} maxLength={120} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="mr">Función en el grupo (opcional)</label><input id="mr" value={f.role} maxLength={80} onChange={set("role")} placeholder="Catequista, lector…" /></div>
        <label className="check"><input type="checkbox" checked={f.isMinor} onChange={(e) => setF({ ...f, isMinor: e.target.checked })} /> Es menor de edad</label>
        {f.isMinor ? (<>
          <div className="field"><label htmlFor="mg">Adulto responsable</label><input id="mg" value={f.guardianName} maxLength={120} onChange={set("guardianName")} /></div>
          <div className="field"><label htmlFor="mgp">Teléfono del responsable</label><input id="mgp" value={f.guardianPhone} maxLength={40} onChange={set("guardianPhone")} /></div>
        </>) : (<>
          <div className="field"><label htmlFor="mp">Teléfono (opcional)</label><input id="mp" value={f.phone} maxLength={40} onChange={set("phone")} /></div>
          <div className="field"><label htmlFor="me">Correo (opcional)</label><input id="me" type="email" value={f.email} maxLength={200} onChange={set("email")} /></div>
        </>)}
        {init.id && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Sigue en el grupo</label>}
        <button className="btn btn-primary" disabled={busy || f.name.trim().length < 2 || (f.isMinor && !f.guardianName.trim())}>{busy ? "Guardando…" : "Guardar"}</button>
      </form>
    </Modal>
  );
}

function AttendanceModal({ groupId, meeting, members, onClose, onSaved }: { groupId: string; meeting: Meeting; members: Member[]; onClose: () => void; onSaved: () => void }) {
  const [present, setPresent] = useState<Record<string, boolean>>(() => Object.fromEntries(members.map((m) => [m.id, meeting.attendance.find((a) => a.memberId === m.id)?.present ?? false])));
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Asistencia — ${fmtDate(meeting.date)}`} onClose={onClose}>
      <ErrorBox msg={err} />
      {!members.length ? <div className="empty">El grupo no tiene miembros activos.</div> : members.map((m) => (
        <label key={m.id} className="check"><input type="checkbox" checked={present[m.id]} onChange={(e) => setPresent({ ...present, [m.id]: e.target.checked })} /> {m.name}</label>
      ))}
      <button className="btn btn-primary" disabled={busy || !members.length} onClick={async () => {
        setBusy(true); setErr(null);
        try { await put(`/organization/groups/${groupId}/meetings/${meeting.id}/attendance`, { items: members.map((m) => ({ memberId: m.id, present: !!present[m.id] })) }); onSaved(); }
        catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
      }}>Guardar asistencia ({Object.values(present).filter(Boolean).length} presentes)</button>
    </Modal>
  );
}
