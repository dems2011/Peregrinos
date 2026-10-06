"use client";
import { useState, type FormEvent } from "react";
import { ApiError, post } from "@/lib/api";
import { errorText, useAccount } from "@/components/account/AccountContext";

/** Mensajes para cada caso del canje (la lógica y las reglas están en el servidor). */
const CLAIM_MESSAGES: Record<string, string> = {
  INVALID_CLAIM_CODE: "El código no es válido. Revisa que esté bien escrito (por ejemplo ABCDE-FGHJK).",
  CLAIM_CODE_EXPIRED: "El código venció. Pide uno nuevo a la organización.",
  ACCOUNT_NOT_VERIFIED: "Primero verifica tu correo. Revisa tu bandeja de entrada.",
  ACCOUNT_INACTIVE: "Tu cuenta no está activa. Consulta con la organización.",
  PERSON_MERGE_CONFLICT: "Ya tienes una participación en el mismo evento que ese registro. Consulta con la organización para resolverlo.",
  PERSON_ALREADY_LINKED: "Esta persona ya está vinculada a una cuenta. Si crees que es un error, consulta con la organización.",
  PERSON_MERGED: "Esa persona fue unificada con otra. Pide un código nuevo a la organización.",
};

/** Vincular la cuenta con la persona que registró una organización, usando su código de un solo uso. */
export default function Vincular() {
  const { reload } = useAccount();
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setOk(false);
    try {
      await post("/auth/account/claim-person", { code: code.trim(), confirm: true });
      setOk(true); setCode(""); setConfirm(false); await reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.code && CLAIM_MESSAGES[e2.code] ? CLAIM_MESSAGES[e2.code] : errorText(e2));
    } finally { setBusy(false); }
  }
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Vincular con mi código</h2>
      <p className="muted">Si una organización te registró antes de que tuvieras cuenta, te puede dar un código. Al usarlo, las participaciones que esa organización registró a tu nombre se suman a tu cuenta. Tu cuenta sigue siendo una sola para todas las organizaciones; lo de las demás no cambia.</p>
      {ok && <div className="alert ok" role="status">¡Listo! Tu cuenta quedó vinculada. Revisa «Mi historial».</div>}
      {err && <div className="alert err" role="alert">{err}</div>}
      <div className="field"><label htmlFor="code">Código de vinculación <span className="req">*</span></label>
        <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="one-time-code" autoCapitalize="characters" placeholder="ABCDE-FGHJK" required /></div>
      <label className="check"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Confirmo que ese registro soy yo y quiero unirlo a mi cuenta</label>
      <button className="btn btn-primary" disabled={busy || !confirm || code.trim().length < 10}>{busy ? "Vinculando…" : "Vincular"}</button>
    </form>
  );
}
