/**
 * Confianza en proxies (`X-Forwarded-For`) para la IP del cliente, que usan el límite de intentos y la auditoría.
 *
 * `true` (lo que había) cree CUALQUIER `X-Forwarded-For` que escriba el cliente: falseando ese encabezado se elude el
 * límite por IP. Lo correcto es confiar solo en los proxies PROPIOS del despliegue:
 * - un número N: los N saltos más cercanos al socket. Solo es seguro si la API NO es alcanzable directamente desde
 *   Internet (p. ej. red privada): con una API pública, quien la llame sin pasar por la web controla las entradas que
 *   el borde no agrega;
 * - una lista de IP/CIDR de esos proxies (recomendada con una API pública): solo se cree el encabezado si quien lo
 *   agregó es un proxy propio.
 * MEDIDO (2026-10-26, Next 15.5.27, `next start`, eco en el lugar de la API): la reescritura `/api` de la web reenvía
 * `X-Forwarded-For` TAL CUAL y NO agrega ninguna entrada (tampoco cuando el cliente no envía el encabezado). La web no
 * cuenta como salto; lo que sí agrega entradas es el borde del alojamiento (y, si la web llama a la API por su URL
 * pública, el borde vuelve a agregar la IP de salida de la web).
 * El valor depende de la topología REAL (Render y Railway difieren): se mide en el entorno (docs/PLAN-RAILWAY.md §12) y
 * se fija en `TRUST_PROXY`. Sin la variable se conserva `true` para no cambiar el comportamiento vigente sin medirlo; en
 * producción la API lo advierte al iniciar (`trustProxyWarning`).
 */
export type TrustProxy = boolean | number | string;

export function parseTrustProxy(raw: string | undefined): TrustProxy {
  const v = (raw ?? "").trim();
  if (v === "" || v === "true") return true;
  if (v === "false") return false;
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    if (n < 1 || n > 10) throw new Error("TRUST_PROXY: la cantidad de saltos debe estar entre 1 y 10.");
    return n;
  }
  const list = v.split(",").map((x) => x.trim()).filter(Boolean);
  const ipOrCidr = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F:]+)(\/\d{1,3})?$/;
  if (!list.length || !list.every((x) => ipOrCidr.test(x))) {
    throw new Error("TRUST_PROXY: usa true, false, un número de saltos o una lista de IP/CIDR de los proxies propios.");
  }
  return list.join(",");
}

/** Advertencia de arranque: en producción, confiar en cualquier proxy es inseguro. */
export const trustProxyWarning = (nodeEnv: string, t: TrustProxy) =>
  nodeEnv === "production" && t === true
    ? "TRUST_PROXY no está fijado: se cree cualquier X-Forwarded-For y el límite de intentos por IP puede eludirse. Fija los proxies propios medidos en el entorno (lista de IP/CIDR o cantidad de saltos; lib/proxy.ts)."
    : null;

/** Forma que aceptan los tipos de Fastify: N saltos = confiar en los N más cercanos al socket (misma semántica). */
export function fastifyTrustProxy(t: TrustProxy): boolean | string | ((address: string, hop: number) => boolean) {
  return typeof t === "number" ? (_address, hop) => hop < t : t;
}
