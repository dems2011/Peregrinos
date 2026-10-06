import type { MeResponse, MfaChallengeResponse } from "@peregrinos/shared";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public data?: Record<string, any>, public details?: { field: string; message: string }[]) {
    super(message);
  }
}

/** Se emite en `window` cuando la sesión del personal venció y no se pudo renovar (el panel redirige al login). */
export const SESSION_EXPIRED_EVENT = "pg:session-expired";

async function raw(path: string, init: RequestInit = {}) {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const hasBody = init.body !== undefined && init.body !== null;
  return fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(!isForm && hasBody ? { "Content-Type": "application/json" } : {}), "X-PG-Client": "web", ...(init.headers ?? {}) },
  });
}

/**
 * Rutas que NO se renuevan ante un 401: las de /auth que emiten o cierran sesión, el área de cuenta del peregrino
 * (sesión propia, sin refresh) y las públicas (app del peregrino por enlace, inscripción, solicitud de parroquia).
 * `/auth/me` sí se renueva: es la consulta de la sesión del personal.
 */
const NO_REFRESH = /^\/(auth\/(login|refresh|logout|bootstrap|register-pilgrim|verify-email|account\/|mfa\/(verify|cancel))|pilgrim\/|registration(\/|\?|$)|organization-requests(\/|\?|$)|geo\/)/;

/**
 * Solo un 401 genérico (UNAUTHORIZED) significa "sesión vencida". Otros 401 son respuestas de negocio
 * (p. ej. MFA_INVALID: código incorrecto) y no deben renovar, reintentar ni cerrar la sesión.
 */
async function isSessionExpired(res: Response) {
  if (res.status !== 401) return false;
  const body = await res.clone().json().catch(() => null) as { error?: string } | null;
  return !body?.error || body.error === "UNAUTHORIZED";
}

let refreshing: Promise<boolean> | null = null;
/**
 * Renueva la sesión del personal una sola vez aunque varias peticiones fallen a la vez: el refresh token rota y
 * reusar uno ya rotado se trata como robo (el API revoca todas las sesiones).
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= raw("/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}

/** A6: se emite cuando la API exige enrolar MFA (SUPERADMIN sin segundo factor). */
export const MFA_ENROLLMENT_EVENT = "pg:mfa-enrollment-required";

/**
 * A6: acciones sensibles responden 403 STEP_UP_REQUIRED. Un componente (StepUpDialog) registra aquí cómo pedir el
 * código; si se confirma, la petición original se reintenta una sola vez.
 */
let stepUpHandler: (() => Promise<boolean>) | null = null;
let stepUpPending: Promise<boolean> | null = null;
export function setStepUpHandler(h: (() => Promise<boolean>) | null) { stepUpHandler = h; }

async function errorCode(res: Response, status: number) {
  if (res.status !== status) return null;
  const body = await res.clone().json().catch(() => null) as { error?: string } | null;
  return body?.error ?? null;
}

/** Llama al API; si el token de acceso venció, renueva la sesión una vez y reintenta. */
async function call(path: string, init: RequestInit = {}) {
  let res = await raw(path, init);
  if (!NO_REFRESH.test(path) && (await isSessionExpired(res))) {
    if (await refreshSession()) res = await raw(path, init);
    if ((await isSessionExpired(res)) && typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  const forbiddenCode = await errorCode(res, 403);
  if (forbiddenCode === "STEP_UP_REQUIRED" && stepUpHandler && !path.startsWith("/auth/mfa/")) {
    // Varias peticiones a la vez comparten un solo diálogo.
    stepUpPending ??= stepUpHandler().finally(() => { setTimeout(() => { stepUpPending = null; }, 0); });
    if (await stepUpPending) res = await raw(path, init);
  } else if (forbiddenCode === "MFA_ENROLLMENT_REQUIRED" && typeof window !== "undefined") {
    window.dispatchEvent(new Event(MFA_ENROLLMENT_EVENT));
  }
  return res;
}

async function fail(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}));
  const fallback = res.status === 429 ? "Demasiados intentos. Espera unos minutos e intenta nuevamente." : "Ocurrió un error. Intenta nuevamente.";
  throw new ApiError(res.status, body.message ?? fallback, body.error, body.data, body.details);
}

/** Una petición cancelada (AbortController) no es un error de red: se propaga tal cual para que quien la canceló la ignore. */
const isAbortError = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try { res = await call(path, init); }
  catch (e) {
    if (isAbortError(e)) throw e;
    throw new ApiError(0, "Sin conexión. Revisa tu red e intenta nuevamente.", "NETWORK");
  }
  if (!res.ok) return fail(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
export const upload = <T>(path: string, form: FormData) => api<T>(path, { method: "POST", body: form });

/** Descarga un archivo (PDF, CSV…) con la sesión actual. `method: "POST"` para endpoints que emiten datos. */
export async function download(path: string, filename: string, init: RequestInit = {}) {
  let res: Response;
  try { res = await call(path, init); }
  catch { throw new ApiError(0, "Sin conexión. Revisa tu red e intenta nuevamente.", "NETWORK"); }
  if (!res.ok) return fail(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** A6: con MFA activo, la contraseña devuelve el desafío ({ mfaRequired: true }) en lugar de la sesión. */
export const login = (email: string, password: string) => post<MeResponse | MfaChallengeResponse>("/auth/login", { email, password });
export const verifyMfaLogin = (input: { code: string } | { recoveryCode: string }) => post<MeResponse>("/auth/mfa/verify", input);
export const cancelMfaLogin = () => post<void>("/auth/mfa/cancel");
export const stepUp = (input: { code: string } | { recoveryCode: string }) => post<MeResponse>("/auth/mfa/step-up", input);
export const logout = () => post<void>("/auth/logout");
export const getMe = () => api<MeResponse>("/auth/me");
