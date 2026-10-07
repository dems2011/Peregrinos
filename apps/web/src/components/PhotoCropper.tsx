"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { PARISH_REQUEST_PHOTO_SPEC as SPEC } from "@peregrinos/shared";

/**
 * B2 — Recorte de la foto principal de la parroquia a formato horizontal 2:1, en el navegador y sin librerías.
 * La vista previa muestra exactamente lo que se sube: se arrastra para encuadrar y el control de zoom acerca.
 * Exporta JPEG de hasta 1600 × 800 px (mínimo 1200 × 600 de la foto original) y menos de 2 MB.
 */
interface Crop { x: number; y: number; zoom: number }

const MIN_W = SPEC.minWidth;

export function PhotoCropper({ disabled, onChange }: { disabled?: boolean; onChange: (photo: Blob | null) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, zoom: 1 });
  const [err, setErr] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // Recorte máximo 2:1 dentro de la foto; el zoom lo achica (sin bajar de 1200 px de ancho reales).
  const base = img ? (img.naturalWidth / img.naturalHeight >= SPEC.ratio
    ? { w: img.naturalHeight * SPEC.ratio, h: img.naturalHeight }
    : { w: img.naturalWidth, h: img.naturalWidth / SPEC.ratio }) : { w: 0, h: 0 };
  const maxZoom = Math.max(1, base.w / MIN_W);
  const cw = base.w / crop.zoom, ch = base.h / crop.zoom;
  const clamp = (c: Crop): Crop => {
    if (!img) return c;
    const w = base.w / c.zoom, h = base.h / c.zoom;
    return { zoom: c.zoom, x: Math.min(Math.max(0, c.x), img.naturalWidth - w), y: Math.min(Math.max(0, c.y), img.naturalHeight - h) };
  };

  function pick(f?: File) {
    setErr(null);
    if (!f) return;
    if (!(SPEC.mimes as readonly string[]).includes(f.type)) { setErr("Usa una foto JPG, PNG o WebP."); return; }
    const url = URL.createObjectURL(f);
    const el = new Image();
    el.onload = () => {
      const w = el.naturalWidth, h = el.naturalHeight;
      const bw = w / h >= SPEC.ratio ? h * SPEC.ratio : w;
      URL.revokeObjectURL(url);
      if (bw < MIN_W) {
        setErr(`La foto es chica (${w} × ${h} px): para el formato horizontal hace falta al menos ${MIN_W} × ${MIN_W / SPEC.ratio} px.`);
        setImg(null); onChange(null); return;
      }
      const bh = bw / SPEC.ratio;
      setImg(el);
      setCrop({ zoom: 1, x: (w - bw) / 2, y: (h - bh) / 2 });
    };
    el.onerror = () => { URL.revokeObjectURL(url); setErr("No se pudo abrir la foto."); };
    el.src = url;
  }

  // Vista previa en vivo: el canvas dibuja exactamente el recorte.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    c.width = 800; c.height = 400;
    c.getContext("2d")?.drawImage(img, crop.x, crop.y, cw, ch, 0, 0, c.width, c.height);
  }, [img, crop, cw, ch]);

  // El recorte se exporta cuando se deja de mover (no en cada cuadro del arrastre).
  useEffect(() => {
    if (!img) return;
    const t = setTimeout(() => {
      const outW = Math.round(Math.min(SPEC.outputWidth, cw)), outH = Math.round(outW / SPEC.ratio);
      const out = document.createElement("canvas");
      out.width = outW; out.height = outH;
      const g = out.getContext("2d");
      if (!g) return;
      g.imageSmoothingQuality = "high";
      g.drawImage(img, crop.x, crop.y, cw, ch, 0, 0, outW, outH);
      const tryQuality = (q: number) => out.toBlob((b) => {
        if (b && b.size > SPEC.maxBytes && q > 0.5) return tryQuality(q - 0.15);
        onChange(b && b.size <= SPEC.maxBytes ? b : null);
      }, "image/jpeg", q);
      tryQuality(0.88);
    }, 250);
    return () => clearTimeout(t);
    // onChange es estable para el formulario; solo importa el recorte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, crop]);

  const scale = () => cw / (frame.current?.clientWidth || 1);
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const k = scale();
    setCrop((c) => clamp({ ...c, x: d.x - (e.clientX - d.px) * k, y: d.y - (e.clientY - d.py) * k }));
  };
  const up = () => { drag.current = null; };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = cw * 0.03;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || disabled) return;
    e.preventDefault();
    setCrop((c) => clamp({ ...c, x: c.x + d[0], y: c.y + d[1] }));
  };
  const zoomTo = (z: number) => setCrop((c) => {
    // Acerca manteniendo el centro del encuadre.
    const cx = c.x + base.w / c.zoom / 2, cy = c.y + base.h / c.zoom / 2;
    return clamp({ zoom: z, x: cx - base.w / z / 2, y: cy - base.h / z / 2 });
  });
  function clear() { setImg(null); setErr(null); onChange(null); if (file.current) file.current.value = ""; }

  return (
    <div className="field">
      <label htmlFor="photo">Foto principal de la iglesia o parroquia</label>
      <input id="photo" ref={file} type="file" accept={SPEC.mimes.join(",")} disabled={disabled} onChange={(e) => pick(e.target.files?.[0])} aria-describedby="photo-hint" />
      <span id="photo-hint" className="hint">Formato horizontal: se recorta a 2:1 (recomendado {SPEC.outputWidth} × {SPEC.outputHeight} px). Mínimo {MIN_W} × {MIN_W / SPEC.ratio} px.</span>
      {err && <div className="alert err" role="alert">{err}</div>}
      {img && (
        <div className="stack-sm">
          <div ref={frame} className="crop-frame" tabIndex={0} role="img" aria-label="Vista previa del recorte. Arrastra o usa las flechas para encuadrar."
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
            <canvas ref={canvas} />
          </div>
          <span className="hint">Así se verá en el perfil público. Arrastra la foto para encuadrarla.</span>
          {maxZoom > 1.01 && (
            <div className="field"><label htmlFor="photo-zoom">Acercar</label>
              <input id="photo-zoom" type="range" min={1} max={maxZoom} step={0.01} value={crop.zoom} disabled={disabled} onChange={(e) => zoomTo(Number(e.target.value))} /></div>
          )}
          <button type="button" className="btn btn-sm" onClick={clear} disabled={disabled}>Quitar foto</button>
        </div>
      )}
    </div>
  );
}
