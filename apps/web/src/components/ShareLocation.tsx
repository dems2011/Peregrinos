"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapPinned } from "lucide-react";
import { ApiError, api, del, post } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { BG_DISTANCE_FILTER_M, backgroundLocation, sendPing } from "@/lib/backgroundLocation";

interface Status { available: boolean; reason: string | null; sharing: boolean; consentAt: string | null; lastSentAt: string | null; minIntervalMs: number }

/**
 * B5 — «Compartir mi ubicación» del peregrino (opt-in explícito). Solo aparece con el seguimiento activado por la
 * parroquia y el evento EN CURSO. Envía la posición como mucho cada `minIntervalMs`: en el navegador, mientras esta
 * pantalla está abierta; en la app Android con el plugin nativo, también minimizada o con la pantalla apagada
 * (lib/backgroundLocation.ts y docs/GPS-SEGUNDO-PLANO.md). Se detiene en
 * cualquier momento, y al detenerse se borra la última posición en el servidor.
 */
export function ShareLocation() {
  const [st, setSt] = useState<Status | null>(null);
  const [active, setActive] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const watch = useRef<number | null>(null);
  /** Watcher del plugin nativo (app Android): sigue con la app minimizada o la pantalla apagada. */
  const nativeWatch = useRef<{ id: string; remove: () => Promise<void> } | null>(null);
  /** Cada inicio invalida al anterior: un addWatcher que termina tarde (ya se detuvo) se quita enseguida. */
  const generation = useRef(0);
  const lastPing = useRef(0);
  const [background, setBackground] = useState(false);

  const stopWatch = useCallback(() => {
    generation.current++;
    if (watch.current != null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    if (nativeWatch.current) { void nativeWatch.current.remove().catch(() => undefined); nativeWatch.current = null; }
    setActive(false);
  }, []);

  const refresh = useCallback(async () => {
    try { const s = await api<Status>("/pilgrim/tracking"); setSt(s); setLastSent(s.lastSentAt); return s; } catch { setSt(null); return null; }
  }, []);

  const startWatch = useCallback(async (minIntervalMs: number) => {
    stopWatch();
    const gen = generation.current;
    const onPosition = async (latitude: number, longitude: number, accuracy: number | null, time: number | null, native: boolean) => {
      if (Date.now() - lastPing.current < minIntervalMs) return; // cuida batería, datos y servidor
      lastPing.current = Date.now();
      try {
        await sendPing({ latitude, longitude, accuracy, recordedAt: new Date(time ?? Date.now()).toISOString() }, native);
        setLastSent(new Date().toISOString()); setMsg(null);
      } catch (e) {
        if (e instanceof ApiError && (e.code === "TRACKING_UNAVAILABLE" || e.code === "NO_CONSENT" || e.status === 401)) { stopWatch(); setMsg("El seguimiento ya no está disponible para este evento."); void refresh(); }
        else setMsg("Sin conexión: se reintentará con la próxima posición.");
      }
    };

    const plugin = await backgroundLocation();
    if (gen !== generation.current) return;
    if (plugin) {
      setActive(true); setBackground(true);
      try {
        const id = await plugin.bg.addWatcher({
          backgroundTitle: "Peregrinos está compartiendo tu ubicación",
          backgroundMessage: "La organización del evento ve tu última posición. Abre la app para dejar de compartir.",
          requestPermissions: true, stale: false, distanceFilter: BG_DISTANCE_FILTER_M,
        }, (loc, err) => {
          if (err) {
            if (err.code === "NOT_AUTHORIZED") { stopWatch(); setMsg("No diste permiso de ubicación. Actívalo en los ajustes del teléfono (Permisos → Ubicación) y vuelve a intentar."); }
            else setMsg("No se pudo leer la ubicación (sin señal de GPS). Se seguirá intentando.");
            return;
          }
          if (loc) void onPosition(loc.latitude, loc.longitude, loc.accuracy ?? null, loc.time ?? null, true);
        });
        const remove = () => plugin.bg.removeWatcher({ id });
        if (gen !== generation.current) { void remove().catch(() => undefined); return; }
        nativeWatch.current = { id, remove };
      } catch {
        if (gen === generation.current) { setActive(false); setMsg("No se pudo iniciar el GPS del teléfono."); }
      }
      return;
    }

    setBackground(false);
    if (!navigator.geolocation) { setMsg("Este dispositivo no permite leer la ubicación."); return; }
    setActive(true);
    watch.current = navigator.geolocation.watchPosition((p) => {
      void onPosition(p.coords.latitude, p.coords.longitude, p.coords.accuracy ?? null, p.timestamp, false);
    }, (err) => {
      if (err.code === err.PERMISSION_DENIED) { stopWatch(); setMsg("No diste permiso de ubicación. Puedes activarlo en los ajustes del teléfono y volver a intentar."); }
      else setMsg("No se pudo leer la ubicación (sin señal de GPS). Se seguirá intentando.");
    }, { enableHighAccuracy: false, maximumAge: 30_000, timeout: 60_000 });
  }, [refresh, stopWatch]);

  // Si ya había consentimiento (volvió a abrir la pantalla), se retoma; al salir de la pantalla se detiene la lectura.
  // En la app Android, minimizarla o apagar la pantalla NO desmonta la pantalla: el envío sigue (notificación fija).
  useEffect(() => {
    void backgroundLocation().then((p) => setBackground(!!p));
    void refresh().then((s) => { if (s?.available && s.sharing) void startWatch(s.minIntervalMs); });
    return () => stopWatch();
  }, [refresh, startWatch, stopWatch]);

  if (!st || (!st.available && !st.sharing)) return null;

  return (
    <section className="card stack-sm" aria-live="polite">
      <h2 style={{ margin: 0 }}><MapPinned size={20} style={{ verticalAlign: "-3px" }} /> Compartir mi ubicación</h2>
      <p className="muted small" style={{ margin: 0 }}>
        La organización puede ver tu última ubicación en el mapa del evento para acompañarte durante el recorrido. Solo la ven las
        personas autorizadas de la parroquia, solo mientras el evento está en curso, y se borra cuando dejas de compartir o al terminar el evento.
        {background
          ? <>Se envía como mucho cada {Math.round(st.minIntervalMs / 1000)} segundos, también con la app minimizada o la pantalla apagada; mientras tanto verás una notificación fija de Peregrinos.</>
          : <>Se envía mientras tengas esta pantalla abierta (como mucho cada {Math.round(st.minIntervalMs / 1000)} segundos).</>}
      </p>
      {msg && <div className="alert warn" role="status">{msg}</div>}
      {active ? (<>
        <p style={{ margin: 0 }}><span className="pill ok">Compartiendo</span> {lastSent ? <span className="muted small">Última posición enviada a las {fmtTime(lastSent)}</span> : <span className="muted small">Buscando señal…</span>}</p>
        <button className="btn" disabled={busy} onClick={async () => { setBusy(true); stopWatch(); await del("/pilgrim/tracking").catch(() => undefined); await refresh(); setBusy(false); setMsg("Dejaste de compartir tu ubicación y se borró la última posición."); }}>Dejar de compartir</button>
      </>) : (
        <button className="btn btn-primary" disabled={busy || !st.available} onClick={async () => {
          setBusy(true); setMsg(null);
          try { await post("/pilgrim/tracking/consent"); const s = await refresh(); if (s) await startWatch(s.minIntervalMs); }
          catch (e) { setMsg(e instanceof ApiError ? e.message : "No se pudo activar."); } finally { setBusy(false); }
        }}>Compartir mi ubicación</button>
      )}
    </section>
  );
}
