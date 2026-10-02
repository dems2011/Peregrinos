import { EventEmitter } from "node:events";

/**
 * Canal en memoria por evento: de aquí salen las actualizaciones en vivo (SSE).
 * Con un solo servidor basta. Si se despliegan varias instancias, se reemplaza este módulo
 * por PostgreSQL LISTEN/NOTIFY (o Redis) sin tocar las rutas: solo cambian publish/subscribe.
 */
export interface BusMessage { type: string; data: Record<string, unknown> }

const bus = new EventEmitter();
bus.setMaxListeners(0);

export const publish = (eventId: string, msg: BusMessage) => { bus.emit(eventId, msg); };
export function subscribe(eventId: string, fn: (m: BusMessage) => void) {
  bus.on(eventId, fn);
  return () => { bus.off(eventId, fn); };
}
