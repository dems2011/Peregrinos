import type { CredentialMode, EventCapability, EventStatus, EventType, EventVisibility, RegistrationField, RegistrationState } from "@peregrinos/shared";

export interface EventRoute {
  originName: string | null; originAddress: string | null; originLat: number | null; originLng: number | null;
  destinationName: string | null; destinationAddress: string | null; destinationLat: number | null; destinationLng: number | null;
  distanceKm: string | null;
}
export interface EventItem {
  id: string; name: string; description: string | null; status: EventStatus; type: EventType;
  startsAt: string; endsAt: string | null; timezone: string; parishName: string | null;
  locationName: string | null; address: string | null; latitude: number | null; longitude: number | null;
  capacity: number | null; visibility: EventVisibility;
  registrationOpen: boolean; registrationOpensAt: string | null; registrationClosesAt: string | null;
  registrationFee: string | null; paymentInstructions: string | null;
  certificateEnabled: boolean; certificatePhrase: string | null; settings: Record<string, unknown>;
  route: EventRoute | null;
  /** A4: módulos activos del evento y estado derivado de la inscripción (no se guarda). */
  capabilities: EventCapability[]; registrationState: RegistrationState; activeParticipants: number;
  _count: { participants: number; checkpoints: number; checkins: number };
  /** B1: preguntas extra del formulario público y diseño de la credencial. */
  registrationFields: RegistrationField[]; credentialMode: CredentialMode;
}
/** B1: mensaje del chat de un evento tal como lo devuelve la API. */
export interface ChatMessage {
  id: string; createdAt: string; deleted: boolean; body: string | null; mine: boolean;
  author: { kind: "STAFF" | "PILGRIM"; name: string; role: string | null };
}
/** B1: perfil público de una parroquia. */
export interface ParishProfile {
  id: string; name: string; description: string | null; address: string | null; phone: string | null; email: string | null;
  website: string | null; instagram: string | null; facebook: string | null; youtube: string | null; tiktok: string | null;
  followerCount: number; logoUrl: string | null; coverUrl: string | null;
}
export interface PublicEvent {
  id: string; name: string; description: string | null; type: EventType; status: EventStatus; startsAt: string; endsAt: string | null;
  timezone: string; locationName: string | null; address: string | null; capacity: number | null; spotsLeft: number | null;
  registrationFee: string | null; registrationState: RegistrationState; registrationPath: string | null;
}
export interface Person {
  id: string; personId?: string; number: number; firstName: string; lastName: string; documentNumber: string; status: "ACTIVE" | "CANCELLED";
  phone?: string; documentType?: string; notes?: string | null; createdAt?: string;
}
export interface Checkpoint {
  id: string; order: number; name: string; description: string | null; address: string | null; reference: string | null;
  latitude: number | null; longitude: number | null; capacity: number | null; status: "ACTIVE" | "INACTIVE"; arrivals: number; percent: number | null;
}
export interface Checkin {
  id: string; participantId: string; checkpointId: string; timestamp: string; method: "NUMBER" | "QR" | "SEARCH";
  status: "ACTIVE" | "CANCELLED" | "CONFLICT"; cancelReason: string | null;
  participant: { number: number; firstName: string; lastName: string; documentNumber: string };
  checkpoint: { name: string; order: number }; operator: { id: string; name: string };
}
export interface Paged<T> { total: number; page: number; pageSize: number; items: T[] }
export type RegStatus = "PENDING_PROOF" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "CANCELLED";
export interface RegistrationRow {
  id: string; firstName: string; lastName: string; documentNumber: string; phone: string; status: RegStatus; rejectionReason: string | null;
  createdAt: string; updatedAt: string; participant: { id: string; number: number } | null;
  proofs: { id: string; amount: string | null; reference: string | null; paidAt: string | null; createdAt: string; mimeType: string; duplicateOfOther: boolean }[];
}
