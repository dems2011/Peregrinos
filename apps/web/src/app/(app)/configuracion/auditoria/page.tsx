"use client";
import { useState } from "react";
import { api, qs } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { useApp } from "@/components/AppContext";
import { Loading, Page } from "@/components/ui";

interface Log { id: string; action: string; entityType: string; createdAt: string; user: { name: string; role: string } | null; metadata: Record<string, unknown> | null }
const LABEL: Record<string, string> = {
  CHECKIN_REGISTERED: "Registró una llegada", CHECKIN_CANCELLED: "Anuló una llegada", CHECKIN_CORRECTED: "Corrigió una llegada", CHECKIN_CONFLICT_RESOLVED: "Resolvió un conflicto",
  REGISTRATION_APPROVED: "Confirmó un pago", REGISTRATION_REJECTED: "Rechazó un pago", REGISTRATION_CREATED: "Nueva inscripción", PAYMENT_PROOF_SUBMITTED: "Comprobante enviado",
  CREDENTIALS_EXPORTED: "Exportó credenciales", CREDENTIAL_EXPORTED: "Exportó una credencial", INVITATION_CREATED: "Invitó a una persona", INVITATION_ACCEPTED: "Aceptó una invitación",
  INVITATION_REVOKED: "Revocó una invitación", INVITATION_RESENT: "Reenvió una invitación", LOGIN: "Inició sesión", LOGIN_FAILED: "Intento de acceso fallido", PARTICIPANT_CREATED: "Agregó una persona",
  PARTICIPANT_UPDATED: "Editó una persona", PARTICIPANTS_IMPORTED: "Importó personas", PILGRIM_ACCESS_ISSUED: "Emitió accesos de peregrinos", PILGRIM_ACCESS_REISSUED: "Reemitió un acceso",
  USER_CREATED: "Creó un usuario", USER_UPDATED: "Editó un usuario", USER_DEACTIVATED: "Desactivó un usuario", EVENT_CREATED: "Creó un evento", EVENT_UPDATED: "Editó el evento", EVENT_STATUS_CHANGED: "Cambió el estado del evento",
  CHECKPOINT_CREATED: "Creó un punto", CHECKPOINT_UPDATED: "Editó un punto", CHECKPOINT_DELETED: "Eliminó un punto", CHECKPOINTS_REORDERED: "Reordenó el recorrido", OPERATOR_ASSIGNMENT_CHANGED: "Cambió puntos de un operador",
};

export default function Auditoria() {
  const { event } = useApp();
  const [pages, setPages] = useState(1);
  const l = useLoad(() => api<Paged<Log>>(`/audit-logs${qs({ eventId: event?.id, pageSize: 30 * pages })}`), [event?.id, pages]);
  return (
    <Page title="Auditoría" back="/configuracion">
      <div className="card flat">
        {l.loading && !l.data ? <Loading /> : !l.data?.items.length ? <div className="empty">Sin movimientos.</div> : l.data.items.map((x) => (
          <div className="list-item" key={x.id} style={{ cursor: "default" }}>
            <span className="grow"><span className="t">{LABEL[x.action] ?? x.action}</span><br /><span className="s">{x.user ? `${x.user.name}` : "Sistema / visitante"} · {fmtDateTime(x.createdAt, event?.timezone)}</span></span>
          </div>
        ))}
      </div>
      {l.data && l.data.total > l.data.items.length && <button className="btn" onClick={() => setPages(pages + 1)}>Ver más</button>}
    </Page>
  );
}
