"use client";
import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";

/** Lector de QR con la cámara trasera. Funciona sin internet (el lector se ejecuta en el teléfono). */
export default function Scanner({ onScan, paused }: { onScan: (text: string) => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef(onScan); cb.current = onScan;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!video.current) return;
    let last = "", lastAt = 0;
    const s = new QrScanner(video.current, (r) => {
      if (pausedRef.current) return;
      const now = Date.now();
      if (r.data === last && now - lastAt < 3000) return; // evita lecturas repetidas del mismo código
      last = r.data; lastAt = now;
      if (navigator.vibrate) navigator.vibrate(60);
      cb.current(r.data);
    }, { preferredCamera: "environment", maxScansPerSecond: 6, highlightScanRegion: false, highlightCodeOutline: false, returnDetailedScanResult: true });
    s.start().catch(() => setErr("No se pudo abrir la cámara. Revisa el permiso del navegador o usa «Número»."));
    return () => { s.stop(); s.destroy(); };
  }, []);

  return (
    <div className="scan-box">
      <video ref={video} playsInline muted />
      <div className="scan-frame" />
      <div className="scan-hint">{err ?? "Apunta al código QR de la credencial"}</div>
    </div>
  );
}
