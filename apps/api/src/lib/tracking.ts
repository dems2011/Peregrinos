import { prisma } from "./prisma";

/** El seguimiento solo funciona con el evento en curso y la función activada por la parroquia. */
export const trackingOpen = (e: { trackingEnabled: boolean; status: string }) => e.trackingEnabled && e.status === "IN_PROGRESS";

/**
 * Retención mínima: con el evento finalizado o cancelado no se conservan ubicaciones. Se borra al consultar (no hay
 * tareas programadas en Render) y también al cambiar el estado del evento (routes/events.ts).
 */
export async function purgeLocationsIfClosed(e: { id: string; status: string }) {
  if (e.status === "FINISHED" || e.status === "CANCELLED") await prisma.locationShare.deleteMany({ where: { eventId: e.id } });
}
