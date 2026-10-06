"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, post } from "@/lib/api";
import type { Person } from "@/lib/types";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Page } from "@/components/ui";

interface Candidate { id: string; firstName: string; lastName: string | null; documentNumber: string | null; phone: string | null }

export default function NuevaPersona() {
  const router = useRouter();
  const { event, can } = useApp();
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", documentNumber: "", number: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A4a: si hay personas con el mismo documento o teléfono, el personal elige la correcta o confirma que es otra.
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save(choice: { personId?: string; confirmNewPerson?: true } = {}) {
    if (!event) return;
    setBusy(true); setErr(null);
    try {
      const body = { firstName: f.firstName, lastName: f.lastName, phone: f.phone, documentNumber: f.documentNumber, ...(f.number ? { number: Number(f.number) } : {}), ...choice };
      const p = await post<Person>(`/events/${event.id}/participants`, body);
      router.replace(can("participant:manage") ? `/personas/${p.id}` : "/personas");
    } catch (e2) {
      if (e2 instanceof ApiError && e2.code === "POSSIBLE_DUPLICATE") { setCandidates((e2.data?.candidates as Candidate[]) ?? []); return; }
      setErr(e2 instanceof ApiError ? (e2.details?.map((d) => d.message).join(". ") || e2.message) : "No se pudo guardar.");
    } finally { setBusy(false); }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); setCandidates(null); void save(); };

  if (candidates) return (
    <Page title="¿Es alguna de estas personas?" back>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>Hay personas registradas con el mismo documento o teléfono. Nunca se unen solas: elige la correcta o confirma que es otra persona.</p>
        <ErrorBox msg={err} />
        {candidates.map((c) => (
          <div key={c.id} className="list-item" style={{ cursor: "default" }}>
            <span className="grow"><span className="t">{c.firstName} {c.lastName ?? ""}</span><br /><span className="s">Documento {c.documentNumber ?? "—"} · Tel. {c.phone ?? "—"}</span></span>
            <button className="btn" disabled={busy} onClick={() => save({ personId: c.id })}>Es esta persona</button>
          </div>
        ))}
        <div className="btn-row"><button className="btn" onClick={() => setCandidates(null)}>Volver</button><button className="btn btn-primary" disabled={busy} onClick={() => save({ confirmNewPerson: true })}>Es otra persona</button></div>
      </div>
    </Page>
  );

  return (
    <Page title="Agregar persona" back>
      <form className="card" onSubmit={submit} noValidate>
        <ErrorBox msg={err} />
        <div className="field"><label htmlFor="n">Nombre <span className="req">*</span></label><input id="n" value={f.firstName} onChange={set("firstName")} autoComplete="off" required /></div>
        <div className="field"><label htmlFor="a">Apellido <span className="req">*</span></label><input id="a" value={f.lastName} onChange={set("lastName")} autoComplete="off" required /></div>
        <div className="field"><label htmlFor="t">Teléfono <span className="req">*</span></label><input id="t" value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="+54 9 11 …" required /></div>
        <div className="field"><label htmlFor="d">Documento <span className="req">*</span></label><input id="d" value={f.documentNumber} onChange={set("documentNumber")} inputMode="numeric" required /></div>
        <div className="field"><label htmlFor="num">Número (opcional)</label><input id="num" value={f.number} onChange={set("number")} inputMode="numeric" placeholder="Si lo dejas vacío se asigna el siguiente" /></div>
        <div className="btn-row"><button type="button" className="btn" onClick={() => router.back()}>Cancelar</button><button className="btn btn-primary" disabled={busy || !event}>{busy ? "Guardando…" : "Guardar"}</button></div>
      </form>
    </Page>
  );
}
