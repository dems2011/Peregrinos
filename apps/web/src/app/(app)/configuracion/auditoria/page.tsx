"use client";
import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Loading, Page } from "@/components/ui";

interface Log { id: string; action: string; entityType: string; createdAt: string; user: { name: string; role: string } | null; actorType: "STAFF" | "PILGRIM" | "PLATFORM" | null; metadata: Record<string, unknown> | null }
const LABEL: Record<string, string> = {
  CHECKIN_REGISTERED: "Registró una llegada", CHECKIN_CANCELLED: "Anuló una llegada", CHECKIN_CORRECTED: "Corrigió una llegada", CHECKIN_CONFLICT_RESOLVED: "Resolvió un conflicto",
  REGISTRATION_APPROVED: "Confirmó un pago", REGISTRATION_REJECTED: "Rechazó un pago", REGISTRATION_CREATED: "Nueva inscripción", PAYMENT_PROOF_SUBMITTED: "Comprobante enviado",
  CREDENTIALS_EXPORTED: "Exportó credenciales", CREDENTIAL_EXPORTED: "Exportó una credencial", INVITATION_CREATED: "Invitó a una persona", INVITATION_ACCEPTED: "Aceptó una invitación",
  INVITATION_REVOKED: "Revocó una invitación", INVITATION_RESENT: "Reenvió una invitación", LOGIN: "Inició sesión", LOGIN_FAILED: "Intento de acceso fallido", PARTICIPANT_CREATED: "Agregó una persona",
  PARTICIPANT_UPDATED: "Editó una persona", PARTICIPANTS_IMPORTED: "Importó personas", PILGRIM_ACCESS_ISSUED: "Emitió accesos de peregrinos", PILGRIM_ACCESS_REISSUED: "Reemitió un acceso",
  USER_CREATED: "Creó un usuario", USER_UPDATED: "Editó un usuario", USER_DEACTIVATED: "Desactivó un usuario", EVENT_CREATED: "Creó un evento", EVENT_UPDATED: "Editó el evento", EVENT_STATUS_CHANGED: "Cambió el estado del evento",
  CHECKPOINT_CREATED: "Creó un punto", CHECKPOINT_UPDATED: "Editó un punto", CHECKPOINT_DELETED: "Eliminó un punto", CHECKPOINTS_REORDERED: "Reordenó el recorrido", OPERATOR_ASSIGNMENT_CHANGED: "Cambió puntos de un operador",
  CONTACT_CREATED: "Agregó un contacto", CONTACT_UPDATED: "Editó un contacto", CONTACT_DELETED: "Eliminó un contacto",
  VOLUNTEER_CREATED: "Sumó un voluntario", VOLUNTEER_STATUS_CHANGED: "Cambió el estado de un voluntario", VOLUNTEER_ASSIGNED: "Asignó a un voluntario", VOLUNTEER_ASSIGNMENT_REVOKED: "Revocó una asignación",
  VOLUNTEER_CONSENT_REQUESTED: "Pidió sumar un voluntario con su código", VOLUNTEER_CONSENT_ACCEPTED: "Aceptó ser voluntario", VOLUNTEER_CONSENT_DECLINED: "Rechazó ser voluntario",
  SHIFT_CREATED: "Creó un turno", SHIFT_UPDATED: "Editó un turno", SHIFT_CANCELLED: "Canceló un turno", PERSON_CLAIMED: "Una persona vinculó su cuenta",
};
const ACTOR: Record<string, string> = { PILGRIM: "Cuenta de peregrino", PLATFORM: "Plataforma" };
/** La API acepta hasta 100 por página. */
const PAGE_SIZE = 50;

export default function Auditoria() {
  const { event } = useApp();
  const eid = event?.id;
  const [items, setItems] = useState<Log[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true); setErr(null);
    try {
      const r = await api<Paged<Log>>(`/audit-logs${qs({ eventId: eid, page: p, pageSize: PAGE_SIZE })}`);
      setItems((cur) => (p === 1 ? r.items : [...cur, ...r.items])); setTotal(r.total); setPage(p);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [eid]);
  useEffect(() => { void load(1); }, [load]);

  return (
    <Page title="Auditoría" back="/configuracion">
      <ErrorBox msg={err} />
      <div className="card flat">
        {loading && !items.length ? <Loading /> : !items.length ? <div className="empty">Sin movimientos.</div> : items.map((x) => (
          <div className="list-item" key={x.id} style={{ cursor: "default" }}>
            <span className="grow"><span className="t">{LABEL[x.action] ?? x.action}</span><br /><span className="s">{x.user ? x.user.name : (x.actorType && ACTOR[x.actorType]) ?? "Sistema / visitante"} · {fmtDateTime(x.createdAt, event?.timezone)}</span></span>
          </div>
        ))}
      </div>
      {total > items.length && <button className="btn" disabled={loading} onClick={() => void load(page + 1)}>{loading ? "Cargando…" : "Ver más"}</button>}
    </Page>
  );
}
