"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, post } from "@/lib/api";
import type { Person } from "@/lib/types";
import { useApp } from "@/components/AppContext";
import { ErrorBox, Page } from "@/components/ui";

export default function NuevaPersona() {
  const router = useRouter();
  const { event, can } = useApp();
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", documentNumber: "", number: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!event) return;
    setBusy(true); setErr(null);
    try {
      const body = { firstName: f.firstName, lastName: f.lastName, phone: f.phone, documentNumber: f.documentNumber, ...(f.number ? { number: Number(f.number) } : {}) };
      const p = await post<Person>(`/events/${event.id}/participants`, body);
      router.replace(can("participant:manage") ? `/personas/${p.id}` : "/personas");
    } catch (e2) {
      setErr(e2 instanceof ApiError ? (e2.details?.map((d) => d.message).join(". ") || e2.message) : "No se pudo guardar.");
    } finally { setBusy(false); }
  }

  return (
    <Page title="Agregar persona" back>
      <form className="card" onSubmit={submit} noValidate>
        <ErrorBox msg={err} />
        <div className="field"><label htmlFor="n">Nombre <span className="req">*</span></label><input id="n" value={f.firstName} onChange={set("firstName")} autoComplete="off" required /></div>
        <div className="field"><label htmlFor="a">Apellido <span className="req">*</span></label><input id="a" value={f.lastName} onChange={set("lastName")} autoComplete="off" required /></div>
        <div className="field"><label htmlFor="t">Teléfono <span className="req">*</span></label><input id="t" value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="+54 9 11 …" required /></div>
        <div className="field"><label htmlFor="d">Documento (DNI) <span className="req">*</span></label><input id="d" value={f.documentNumber} onChange={set("documentNumber")} inputMode="numeric" required /></div>
        <div className="field"><label htmlFor="num">Número (opcional)</label><input id="num" value={f.number} onChange={set("number")} inputMode="numeric" placeholder="Si lo dejas vacío se asigna el siguiente" /></div>
        <div className="btn-row"><button type="button" className="btn" onClick={() => router.back()}>Cancelar</button><button className="btn btn-primary" disabled={busy || !event}>{busy ? "Guardando…" : "Guardar"}</button></div>
      </form>
    </Page>
  );
}
