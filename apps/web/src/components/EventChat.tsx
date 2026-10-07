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
 */
const POLL_MS = 5000;

export function EventChat({ base, timezone, canModerate = false, emptyHint }: { base: string; timezone?: string | null; canModerate?: boolean; emptyHint?: string }) {
  const [items, setItems] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setItems((cur) => {
      const map = new Map((cur ?? []).map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      return [...map.values()].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    });
    last.current = incoming[incoming.length - 1].createdAt;
  }, []);

  const load = useCallback(async (initial = false) => {
    try {
      const q = !initial && last.current ? `?after=${encodeURIComponent(last.current)}` : "";
      const r = await api<{ items: ChatMessage[] }>(`${base}${q}`);
      if (initial) { setItems(r.items); last.current = r.items.length ? r.items[r.items.length - 1].createdAt : null; }
      else merge(r.items);
      setErr(null);
    } catch (e) { if (initial) setErr(e instanceof ApiError ? e.message : "No se pudo cargar el chat."); }
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
    try { merge([await post<ChatMessage>(base, { body })]); setText(""); stick.current = true; }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "No se pudo enviar."); }
    finally { setBusy(false); }
  }
  async function hide(m: ChatMessage) {
    try { await del(`${base}/${m.id}`); setItems((cur) => cur?.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null } : x)) ?? null); }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "No se pudo ocultar."); }
  }

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }} aria-live="polite">
        {!items && !err && <div className="spinner" role="status" aria-label="Cargando" />}
        {items && !items.length && <p className="muted" style={{ textAlign: "center", padding: 16 }}>{emptyHint ?? "Todavía no hay mensajes. ¡Escribe el primero!"}</p>}
        {items?.map((m) => (
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
