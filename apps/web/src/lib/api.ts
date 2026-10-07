import type { MeResponse, MfaChallengeResponse } from "@peregrinos/shared";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public data?: Record<string, any>, public details?: { field: string; message: string }[]) {
    super(message);
  }
}

/** Se emite en `window` cuando la sesión del personal venció y no se pudo renovar (el panel redirige al login). */
export const SESSION_EXPIRED_EVENT = "pg:session-expired";

function fetchOnce(path: string, init: RequestInit) {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const hasBody = init.body !== undefined && init.body !== null;
  return fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(!isForm && hasBody ? { "Content-Type": "application/json" } : {}), "X-PG-Client": "web", ...(init.headers ?? {}) },
  });
}

/* ---------- Arranque en frío del API (Render) ---------- */

/**
 * Se emite en `window` (detail: { active: boolean }) mientras se reintenta una lectura porque el API está despertando:
 * ConnectionStatus muestra "Conectando con Peregrinos…".
 */
export const CONNECTING_EVENT = "pg:connecting";
/** Esperas entre reintentos (máximo 3 reintentos, ~50 s en total: lo que tarda en despertar el API). */
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
const COLD_START_MESSAGE = "No pudimos conectar con Peregrinos. El servicio se está iniciando: intenta nuevamente en unos segundos.";

/**
 * Respuesta del proxy (no del API) mientras el API despierta: 502/503, o 500 sin JSON. Los errores del propio API
 * siempre son JSON ({ error, message }) y nunca se reintentan. 504 no se reintenta: el API pudo haber procesado.
 */
function isColdStartResponse(res: Response) {
  if (res.status === 502 || res.status === 503) return true;
  return res.status === 500 && !(res.headers.get("content-type") ?? "").includes("application/json");
}

let connecting = 0;
function setConnecting(delta: 1 | -1) {
  const before = connecting;
  connecting += delta;
  if (typeof window !== "undefined" && (before === 0) !== (connecting === 0)) {
    window.dispatchEvent(new CustomEvent(CONNECTING_EVENT, { detail: { active: connecting > 0 } }));
  }
}

const sleep = (ms: number, signal?: AbortSignal | null) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});

/**
 * Petición al API. Solo las lecturas (GET/HEAD) se reintentan si fallan por el arranque en frío o la red; una escritura
 * (POST/PUT/PATCH/DELETE) nunca se repite automáticamente: podría duplicar datos. `retry: false` desactiva el reintento
 * (descargas: algunas marcan datos, p. ej. credenciales impresas).
 */
async function raw(path: string, init: RequestInit = {}, retry = true) {
  const method = (init.method ?? "GET").toUpperCase();
  if (!retry || (method !== "GET" && method !== "HEAD")) return fetchOnce(path, init);
  let waiting = false;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchOnce(path, init);
        if (!isColdStartResponse(res) || attempt >= RETRY_DELAYS_MS.length) return res;
      } catch (e) {
        if (isAbortError(e) || attempt >= RETRY_DELAYS_MS.length) throw e;
      }
      if (!waiting) { waiting = true; setConnecting(1); }
      await sleep(RETRY_DELAYS_MS[attempt], init.signal);
    }
  } finally {
    if (waiting) setConnecting(-1);
  }
}

let warming: Promise<void> | null = null;
/**
 * Despierta el API con lecturas de /api/health (con los mismos reintentos). Lo usa la primera página y, tras una
 * escritura que falló por el arranque en frío, deja el API listo para que el usuario vuelva a intentarlo.
 */
export function warmUpApi(): Promise<void> {
  warming ??= raw("/health")
    .then(() => undefined, () => undefined)
    .finally(() => { setTimeout(() => { warming = null; }, 0); });
  return warming;
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
async function call(path: string, init: RequestInit = {}, retry = true) {
  let res = await raw(path, init, retry);
  if (!NO_REFRESH.test(path) && (await isSessionExpired(res))) {
    if (await refreshSession()) res = await raw(path, init, retry);
    if ((await isSessionExpired(res)) && typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  const forbiddenCode = await errorCode(res, 403);
  if (forbiddenCode === "STEP_UP_REQUIRED" && stepUpHandler && !path.startsWith("/auth/mfa/")) {
    // Varias peticiones a la vez comparten un solo diálogo.
    stepUpPending ??= stepUpHandler().finally(() => { setTimeout(() => { stepUpPending = null; }, 0); });
    if (await stepUpPending) res = await raw(path, init, retry);
  } else if (forbiddenCode === "MFA_ENROLLMENT_REQUIRED" && typeof window !== "undefined") {
    window.dispatchEvent(new Event(MFA_ENROLLMENT_EVENT));
  }
  return res;
}

/** Si la petición se reintentó sola (lecturas con reintento): no hace falta volver a despertar el API. */
const autoRetried = (init: RequestInit, retry: boolean) => retry && ["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase());

async function fail(res: Response, warm = false): Promise<never> {
  if (isColdStartResponse(res)) {
    // El API está despertando: mensaje claro y, si la operación no se reintentó sola (escrituras, descargas), se
    // termina de despertar en segundo plano para que el usuario pueda volver a intentarlo. Nunca se repite la operación.
    if (warm) void warmUpApi();
    throw new ApiError(res.status, COLD_START_MESSAGE, "UNAVAILABLE");
  }
  const body = await res.json().catch(() => ({}));
  const fallback = res.status === 429 ? "Demasiados intentos. Espera unos minutos e intenta nuevamente." : "Ocurrió un error. Intenta nuevamente.";
  throw new ApiError(res.status, body.message ?? fallback, body.error, body.data, body.details);
}

/** Sin respuesta (red o API despertando): si no se reintentó sola (escrituras, descargas), se despierta el API. */
function networkError(init: RequestInit, retry: boolean): ApiError {
  if (!autoRetried(init, retry)) void warmUpApi();
  return new ApiError(0, "Sin conexión. Revisa tu red e intenta nuevamente.", "NETWORK");
}

/** Una petición cancelada (AbortController) no es un error de red: se propaga tal cual para que quien la canceló la ignore. */
const isAbortError = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try { res = await call(path, init); }
  catch (e) {
    if (isAbortError(e)) throw e;
    throw networkError(init, true);
  }
  if (!res.ok) return fail(res, !autoRetried(init, true));
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
export const upload = <T>(path: string, form: FormData, method: "POST" | "PUT" = "POST", headers?: Record<string, string>) =>
  api<T>(path, { method, body: form, headers });

/** Descarga un archivo (PDF, CSV…) con la sesión actual. `method: "POST"` para endpoints que emiten datos. */
export async function download(path: string, filename: string, init: RequestInit = {}) {
  let res: Response;
  // Sin reintento automático: algunas descargas marcan datos (credenciales impresas); el usuario vuelve a pulsar.
  try { res = await call(path, init, false); }
  catch { throw networkError(init, false); }
  if (!res.ok) return fail(res, true);
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
