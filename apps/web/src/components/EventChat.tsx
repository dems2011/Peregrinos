"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Trash2 } from "lucide-react";
import { ApiError, api, del, post } from "@/lib/api";
import { fmtDateTimeMedium } from "@/lib/format";
import type { ChatMessage } from "@/lib/types";

/**
 * B1 — Chat de un evento (aislado por evento). Mismo componente para el personal (/api/events/:id/chat), la cuenta
 * del peregrino (/api/auth/account/events/:id/chat) y el enlace personal (/api/pilgrim/chat). Sondea cada 5 s solo
 * los mensajes nuevos (?after=) mientras la pestaña está visible.
 *
 * «Limpiar mensajes anteriores» es solo de la vista de quien lo usa: guarda en este dispositivo la hora (del servidor)
 * del último mensaje visible y desde entonces muestra solo los posteriores. No borra ni oculta nada en el servidor:
 * el historial y lo que ven los demás no cambian, y «Mostrar anteriores» lo deshace.
 */
const POLL_MS = 5000;

/** La hora más reciente (ISO del servidor) de la lista, o null si está vacía. */
const newest = (times: string[]) => times.reduce<string | null>((a, t) => (!a || +new Date(t) > +new Date(a) ? t : a), null);
/** Corte guardado en este dispositivo; sin almacenamiento disponible (o en el servidor), ninguno. */
function readCleared(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function EventChat({ base, timezone, canModerate = false, emptyHint, viewerId }: { base: string; timezone?: string | null; canModerate?: boolean; emptyHint?: string; viewerId?: string }) {
  const [items, setItems] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const itemsRef = useRef(items); itemsRef.current = items;
  // Corte de la vista por chat y por persona (el mismo dispositivo puede usarlo más de una cuenta). Se lee al montar
  // (sin parpadeo de los mensajes ya limpiados) y de nuevo si cambia el chat o la persona.
  const clearKey = `pg_chat_cleared:${viewerId ?? "-"}:${base}`;
  const [clearedAt, setClearedAt] = useState<string | null>(() => readCleared(clearKey));
  useEffect(() => { setClearedAt(readCleared(clearKey)); }, [clearKey]);
  const visible = items && clearedAt ? items.filter((m) => +new Date(m.createdAt) > +new Date(clearedAt)) : items;

  /**
   * `advance`: solo lo que trae el sondeo mueve el cursor `last`. El mensaje propio recién enviado no lo mueve: si lo
   * hiciera, el próximo ?after= saltaría los mensajes de otros escritos un instante antes y no llegarían nunca.
   */
  const merge = useCallback((incoming: ChatMessage[], advance = true) => {
    if (!incoming.length) return;
    setItems((cur) => {
      const map = new Map((cur ?? []).map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      return [...map.values()].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    });
    if (advance) last.current = newest([...(last.current ? [last.current] : []), ...incoming.map((m) => m.createdAt)]);
  }, []);

  /** Devuelve los mensajes recibidos (para que «Limpiar» pueda incluir los que acaban de llegar). */
  const load = useCallback(async (initial = false): Promise<ChatMessage[]> => {
    try {
      const q = !initial && last.current ? `?after=${encodeURIComponent(last.current)}` : "";
      const r = await api<{ items: ChatMessage[] }>(`${base}${q}`);
      if (initial) { setItems(r.items); last.current = newest(r.items.map((m) => m.createdAt)); }
      else merge(r.items);
      setErr(null);
      return r.items;
    } catch (e) { if (initial) setErr(e instanceof ApiError ? e.message : "No se pudo cargar el chat."); return []; }
  }, [base, merge]);

  useEffect(() => {
    void load(true);
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Se mantiene abajo salvo que la persona haya subido a leer mensajes anteriores.
  useEffect(() => { const el = listRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [items]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim(); if (!body || busy) return;
    setBusy(true); setErr(null);
    try { merge([await post<ChatMessage>(base, { body })], false); setText(""); stick.current = true; }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "No se pudo enviar."); }
    finally { setBusy(false); }
  }
  async function hide(m: ChatMessage) {
    try { await del(`${base}/${m.id}`); setItems((cur) => cur?.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null } : x)) ?? null); }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "No se pudo ocultar."); }
  }
  async function clearOld() {
    if (!window.confirm("¿Limpiar los mensajes anteriores? Solo dejarán de verse en tu pantalla: no se borran y los demás los siguen viendo.")) return;
    // Antes de cortar se traen los pendientes: el corte es la hora del servidor del mensaje más reciente que existe ahora
    // (no la del teléfono), así que todo lo que se escriba después siempre se ve.
    const fresh = await load();
    const cut = newest([...(itemsRef.current ?? []), ...fresh].map((m) => m.createdAt));
    if (!cut) return;
    try { localStorage.setItem(clearKey, cut); } catch { /* sin almacenamiento: dura hasta salir de la pantalla */ }
    setClearedAt(cut);
  }
  function showOld() {
    try { localStorage.removeItem(clearKey); } catch { /* sin almacenamiento */ }
    setClearedAt(null);
  }

  return (
    <div className="chat">
      {items && (visible?.length || clearedAt) ? (
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          {clearedAt && <button type="button" className="btn btn-sm" onClick={showOld}>Mostrar anteriores</button>}
          {!!visible?.length && <button type="button" className="btn btn-sm" onClick={() => void clearOld()}>Limpiar mensajes anteriores</button>}
        </div>
      ) : null}
      <div className="chat-list" ref={listRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }} aria-live="polite">
        {!items && !err && <div className="spinner" role="status" aria-label="Cargando" />}
        {items && !items.length && <p className="muted" style={{ textAlign: "center", padding: 16 }}>{emptyHint ?? "Todavía no hay mensajes. ¡Escribe el primero!"}</p>}
        {items && !!items.length && !visible?.length && <p className="muted" style={{ textAlign: "center", padding: 16 }}>Limpiaste los mensajes anteriores. Aquí verás los nuevos.</p>}
        {visible?.map((m) => (
          <div key={m.id} className={`chat-msg ${m.mine ? "mine" : ""} ${m.author.kind === "STAFF" ? "staff" : ""}`}>
            <div className="chat-meta">
              <b>{m.mine ? "Tú" : m.author.name}</b>{m.author.role && <span className="pill" style={{ marginLeft: 6 }}>{m.author.role}</span>}
              <span className="muted"> · {fmtDateTimeMedium(m.createdAt, timezone, undefined, false)}</span>
              {canModerate && !m.deleted && <button type="button" className="chat-hide" aria-label="Ocultar mensaje" onClick={() => void hide(m)}><Trash2 size={14} /></button>}
            </div>
            <div className="chat-body">{m.deleted ? <i className="muted">Mensaje oculto por un administrador</i> : m.body}</div>
          </div>
        ))}
      </div>
      {err && <div className="alert err" role="alert">{err}</div>}
      <form className="chat-form" onSubmit={send}>
        <label htmlFor="chat-input" className="sr-only">Mensaje</label>
        <textarea id="chat-input" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe un mensaje…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(e as unknown as FormEvent); } }} />
        <button className="btn btn-primary" disabled={busy || !text.trim()} aria-label="Enviar"><Send size={18} /></button>
      </form>
    </div>
  );
}
