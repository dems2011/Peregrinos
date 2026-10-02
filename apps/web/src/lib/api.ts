import type { MeResponse } from "@peregrinos/shared";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public data?: Record<string, any>, public details?: { field: string; message: string }[]) {
    super(message);
  }
}

async function raw(path: string, init: RequestInit = {}) {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  return fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), "X-PG-Client": "web", ...(init.headers ?? {}) },
  });
}

/** Llama al API; si el token de acceso venció, renueva la sesión una vez y reintenta. */
async function call(path: string, init: RequestInit = {}) {
  let res = await raw(path, init);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const r = await raw("/auth/refresh", { method: "POST" });
    if (r.ok) res = await raw(path, init);
  }
  return res;
}

async function fail(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new ApiError(res.status, body.message ?? "Ocurrió un error. Intenta nuevamente.", body.error, body.data, body.details);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await call(path, init);
  if (!res.ok) return fail(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
export const upload = <T>(path: string, form: FormData) => api<T>(path, { method: "POST", body: form });

/** Descarga un archivo (PDF, CSV…) con la sesión actual. `method: "POST"` para endpoints que emiten datos. */
export async function download(path: string, filename: string, init: RequestInit = {}) {
  const res = await call(path, init);
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

export const login = (email: string, password: string) => post<MeResponse>("/auth/login", { email, password });
export const logout = () => post<void>("/auth/logout");
export const getMe = () => api<MeResponse>("/auth/me");
