"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError, setStepUpHandler, stepUp } from "@/lib/api";
import { ErrorBox, Modal } from "@/components/ui";

/**
 * A6 — Reautenticación (step-up). Cuando una acción sensible responde 403 STEP_UP_REQUIRED, el cliente API abre este
 * diálogo; con el código correcto la acción se reintenta sola. Montado una vez dentro del panel del personal.
 */
export function StepUpDialog() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    setStepUpHandler(() => new Promise<boolean>((resolve) => { resolver.current = resolve; setOpen(true); }));
    return () => { setStepUpHandler(null); resolver.current?.(false); };
  }, []);

  const finish = (ok: boolean) => { setOpen(false); resolver.current?.(ok); resolver.current = null; };
  if (!open) return null;
  return <StepUpForm onDone={finish} />;
}

export function StepUpForm({ onDone }: { onDone: (ok: boolean) => void }) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = useRecovery ? value.replace(/[^A-Za-z0-9]/g, "").length === 10 : /^\d{6}$/.test(value.replace(/\s/g, ""));

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await stepUp(useRecovery ? { recoveryCode: value.trim() } : { code: value.replace(/\s/g, "") });
      onDone(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "No se pudo verificar el código.");
      setValue("");
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Confirma tu identidad" onClose={() => onDone(false)}>
      <p className="muted small">Esta acción es sensible. Ingresa el código de tu app de verificación (vale 10 minutos).</p>
      <ErrorBox msg={err} />
      <form onSubmit={(e) => { e.preventDefault(); if (valid && !busy) void submit(); }}>
        <div className="field">
          <label htmlFor="stepup-code">{useRecovery ? "Código de recuperación" : "Código de 6 dígitos"}</label>
          <input
            id="stepup-code"
            autoFocus
            autoComplete="one-time-code"
            inputMode={useRecovery ? "text" : "numeric"}
            maxLength={useRecovery ? 14 : 7}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" disabled={!valid || busy}>{busy ? "Verificando…" : "Confirmar"}</button>
      </form>
      <button type="button" className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => { setUseRecovery(!useRecovery); setValue(""); setErr(null); }}>
        {useRecovery ? "Usar la app de verificación" : "Usar un código de recuperación"}
      </button>
    </Modal>
  );
}
