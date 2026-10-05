"use client";
import { useState } from "react";
import { MailPlus, RefreshCw, Trash2, UserCog } from "lucide-react";
import { ACCESS_LEVELS, canGrantRole, canInviteRole } from "@peregrinos/shared";
import { api, ApiError, del, patch, post, put } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import type { Checkpoint } from "@/lib/types";
import { useApp } from "@/components/AppContext";
import { copyText, ErrorBox, Loading, Modal, Page, StatusPill } from "@/components/ui";

interface U { id: string; name: string; email: string; role: "SUPERADMIN" | "ADMIN" | "OPERATOR"; extraPermissions: string[]; isActive: boolean }
interface Inv { id: string; email: string; role: string; extraPermissions: string[]; status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED"; expiresAt: string; invitedBy: string | null }
const levelOf = (role: string, extras: string[]) => ACCESS_LEVELS.find((l) => l.role === role && l.extraPermissions.every((p) => extras.includes(p)) && (role !== "OPERATOR" || (l.extraPermissions.length > 0) === extras.includes("participant:create")));
const INV: Record<string, [string, string]> = { PENDING: ["Pendiente", "warn"], ACCEPTED: ["Aceptada", "ok"], REVOKED: ["Revocada", "gray"], EXPIRED: ["Vencida", "err"] };

export default function Usuarios() {
  const { me, event, can } = useApp();
  const eid = event?.id;
  const users = useLoad(() => (can("user:manage") ? api<{ items: U[] }>("/users") : Promise.resolve(null)), []);
  const invs = useLoad(() => (can("invitation:manage") ? api<{ items: Inv[] }>("/invitations") : Promise.resolve(null)), []);
  const cps = useLoad(() => (eid ? api<{ items: Checkpoint[] }>(`/events/${eid}/checkpoints`) : Promise.resolve(null)), [eid]);
  const [inviting, setInviting] = useState(false);
  const [assign, setAssign] = useState<U | null>(null);
  const [shown, setShown] = useState<{ url: string; emailSent: boolean; email: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => { setErr(null); try { await fn(); } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo completar la acción."); } };

  return (
    <Page title="Usuarios e invitaciones" back="/configuracion" action={can("invitation:manage") ? <button className="ic" aria-label="Invitar" onClick={() => setInviting(true)}><MailPlus size={24} /></button> : undefined}>
      <ErrorBox msg={err} />
      {can("invitation:manage") && <button className="btn btn-primary" onClick={() => setInviting(true)}><MailPlus size={20} /> Invitar por correo</button>}

      {invs.data && (<>
        <div className="sec-title">Invitaciones</div>
        <div className="card flat">
          {!invs.data.items.length ? <div className="empty">Aún no enviaste invitaciones.</div> : invs.data.items.map((i) => (
            <div className="list-item" key={i.id} style={{ cursor: "default" }}>
              <span className="grow"><span className="t">{i.email}</span><br /><span className="s">{levelOf(i.role, i.extraPermissions)?.label ?? i.role} · vence {fmtDate(i.expiresAt)}{i.invitedBy ? ` · ${i.invitedBy}` : ""}</span></span>
              <span className={`pill ${INV[i.status][1]}`}>{INV[i.status][0]}</span>
              {(i.status === "PENDING" || i.status === "EXPIRED") && canGrantRole(me.user.role, i.role as "OPERATOR") && <>
                <button className="btn btn-sm" aria-label="Reenviar" onClick={() => run(async () => { const r = await post<{ inviteUrl: string; emailSent: boolean }>(`/invitations/${i.id}/resend`); setShown({ url: r.inviteUrl, emailSent: r.emailSent, email: i.email }); invs.reload(); })}><RefreshCw size={16} /></button>
                {i.status === "PENDING" && <button className="btn btn-sm" aria-label="Revocar" onClick={() => run(async () => { await del(`/invitations/${i.id}`); invs.reload(); })}><Trash2 size={16} /></button>}
              </>}
            </div>
          ))}
        </div>
      </>)}

      {users.loading && can("user:manage") ? <Loading /> : users.data && (<>
        <div className="sec-title">Personal con acceso</div>
        <div className="card flat">
          {users.data.items.map((u) => (
            <div className="list-item" key={u.id} style={{ cursor: "default", opacity: u.isActive ? 1 : .55 }}>
              <span className="grow"><span className="t">{u.name}</span> {!u.isActive && <StatusPill s="INACTIVE" />}<br /><span className="s">{u.email} · {levelOf(u.role, u.extraPermissions)?.label ?? u.role}</span></span>
              {u.role === "OPERATOR" && <button className="btn btn-sm" aria-label="Puntos asignados" onClick={() => setAssign(u)}><UserCog size={16} /> Puntos</button>}
              {u.id !== me.user.id && <button className="btn btn-sm" onClick={() => run(async () => { if (u.isActive && !confirm(`¿Desactivar a ${u.name}? Perderá el acceso de inmediato.`)) return; await patch(`/users/${u.id}`, { isActive: !u.isActive }); users.reload(); })}>{u.isActive ? "Desactivar" : "Activar"}</button>}
            </div>
          ))}
        </div>
      </>)}

      {inviting && <InviteModal cps={cps.data?.items ?? []} onClose={() => setInviting(false)} onSent={(r) => { setInviting(false); setShown(r); invs.reload(); }} />}
      {assign && <AssignModal u={assign} cps={cps.data?.items ?? []} onClose={() => setAssign(null)} />}
      {shown && (
        <Modal title="Invitación creada" onClose={() => setShown(null)}>
          <div className={`alert ${shown.emailSent ? "ok" : "warn"}`}>{shown.emailSent ? `Enviamos el correo a ${shown.email}.` : "El correo no está configurado o no salió: copia el enlace y envíalo tú (por WhatsApp, por ejemplo)."}</div>
          <div className="copy-box">{`${window.location.origin}${new URL(shown.url).pathname}${new URL(shown.url).search}`}</div>
          <button className="btn btn-primary" onClick={() => copyText(`${window.location.origin}${new URL(shown.url).pathname}${new URL(shown.url).search}`)}>Copiar enlace</button>
          <p className="muted small">El enlace sirve una sola vez y vence en 7 días.</p>
        </Modal>
      )}
    </Page>
  );
}

function InviteModal({ cps, onClose, onSent }: { cps: Checkpoint[]; onClose: () => void; onSent: (r: { url: string; emailSent: boolean; email: string }) => void }) {
  const { me } = useApp();
  const levels = ACCESS_LEVELS.filter((l) => canInviteRole(me.user.role, l.role));
  const [email, setEmail] = useState(""); const [lv, setLv] = useState(levels[0].id); const [sel, setSel] = useState<string[]>([]); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const level = levels.find((l) => l.id === lv)!;
  return (
    <Modal title="Invitar por correo" onClose={onClose}>
      <ErrorBox msg={err} />
      <div className="field"><label htmlFor="ie">Correo electrónico</label><input id="ie" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></div>
      <div className="field"><label>Nivel de acceso</label>
        {levels.map((l) => (<label key={l.id} className="check" style={{ alignItems: "flex-start" }}><input type="radio" name="lv" checked={lv === l.id} onChange={() => setLv(l.id)} /><span>{l.label}<br /><span className="muted small" style={{ fontWeight: 400 }}>{l.description}</span></span></label>))}
      </div>
      {level.role === "OPERATOR" && cps.length > 0 && (
        <div className="field"><label>Puntos de control que atenderá</label>
          {cps.map((c) => (<label key={c.id} className="check"><input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} /> {c.order}. {c.name}</label>))}
        </div>
      )}
      <button className="btn btn-primary" disabled={busy || !/\S+@\S+\.\S+/.test(email)} onClick={async () => {
        setBusy(true); setErr(null);
        try { const r = await post<{ inviteUrl: string; emailSent: boolean }>("/invitations", { email, role: level.role, extraPermissions: level.extraPermissions, checkpointIds: level.role === "OPERATOR" ? sel : [] }); onSent({ url: r.inviteUrl, emailSent: r.emailSent, email }); }
        catch (e) { setErr(e instanceof ApiError ? (e.details?.map((d) => d.message).join(". ") || e.message) : "No se pudo invitar."); } finally { setBusy(false); }
      }}>{busy ? "Enviando…" : "Enviar invitación"}</button>
    </Modal>
  );
}

function AssignModal({ u, cps, onClose }: { u: U; cps: Checkpoint[]; onClose: () => void }) {
  const a = useLoad(() => api<{ items: { checkpointId: string }[] }>(`/users/${u.id}/assignments`), [u.id]);
  const [sel, setSel] = useState<string[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const cur = sel ?? a.data?.items.map((i) => i.checkpointId) ?? [];
  return (
    <Modal title={`Puntos de ${u.name}`} onClose={onClose}>
      <ErrorBox msg={err} />
      {a.loading ? <Loading /> : cps.map((c) => (<label key={c.id} className="check"><input type="checkbox" checked={cur.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id))} /> {c.order}. {c.name}</label>))}
      <button className="btn btn-primary" onClick={async () => { try { // conserva los puntos que tenga en otros eventos (la API reemplaza la lista completa)
        const others = (a.data?.items ?? []).map((i) => i.checkpointId).filter((id) => !cps.some((c) => c.id === id));
        await put(`/users/${u.id}/assignments`, { checkpointIds: [...cur, ...others] }); onClose(); } catch (e) { setErr(e instanceof ApiError ? e.message : "No se pudo guardar."); } }}>Guardar</button>
    </Modal>
  );
}
