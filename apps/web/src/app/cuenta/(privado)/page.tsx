"use client";
import Link from "next/link";
import { useAccount } from "@/components/account/AccountContext";
import { fmtDate, viewerTimeZone } from "@/lib/format";

const fmt = (iso: string | null) => (iso ? fmtDate(iso, viewerTimeZone()) : "—");

/** Mi cuenta: datos tal como los devuelve /api/auth/account/me. La identidad no se edita desde aquí. */
export default function MiCuenta() {
  const { me } = useAccount();
  const p = me.person;
  return (
    <>
      <section className="card stack-sm">
        <h2>Mis datos</h2>
        <dl className="kv">
          <dt>Nombre</dt><dd>{p?.firstName ?? "—"}</dd>
          <dt>Apellido</dt><dd>{p?.lastName ?? "—"}</dd>
          <dt>Documento</dt><dd>{p?.documentNumber ? `${p.documentType ?? ""} ${p.documentNumber}`.trim() : "—"}</dd>
          <dt>Teléfono</dt><dd>{p?.phone ?? "—"}</dd>
        </dl>
        <p className="muted small">Para corregir tu nombre o documento, consulta con la organización: estos datos no se cambian desde la cuenta.</p>
      </section>
      <section className="card stack-sm">
        <h2>Mi cuenta</h2>
        <dl className="kv">
          <dt>Correo</dt><dd>{me.user.email}</dd>
          <dt>Estado del correo</dt><dd>{me.user.emailVerified ? <span className="pill ok">Verificado</span> : <span className="pill warn">Sin verificar</span>}</dd>
          <dt>Cuenta creada</dt><dd>{fmt(me.user.createdAt)}</dd>
        </dl>
      </section>
      <section className="card stack-sm">
        <h2>¿Te registró una parroquia?</h2>
        <p className="muted">Si una organización te dio un código de vinculación, úsalo para ver aquí tus participaciones.</p>
        <Link className="btn" href="/cuenta/vincular">Vincular con mi código</Link>
      </section>
    </>
  );
}
