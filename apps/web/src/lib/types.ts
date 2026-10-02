export interface EventItem {
  id: string; name: string; description: string | null; status: "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED";
  startsAt: string; timezone: string; parishName: string | null; registrationOpen: boolean; registrationFee: string | null; paymentInstructions: string | null;
  _count: { participants: number; checkpoints: number; checkins: number };
}
export interface Person {
  id: string; number: number; firstName: string; lastName: string; documentNumber: string; status: "ACTIVE" | "INACTIVE" | "CANCELLED";
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
