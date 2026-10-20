import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, cspHeaderName, cspMode, newNonce } from "@/lib/csp";

/**
 * CSP con nonce por petición (src/lib/csp.ts). Next toma el nonce de la cabecera CSP de la PETICIÓN y lo pone en sus
 * propios scripts al renderizar; por eso el layout raíz se renderiza de forma dinámica. La API (/api) y los archivos
 * estáticos no pasan por aquí.
 */
export function middleware(request: NextRequest) {
  const mode = cspMode(process.env.CSP_MODE);
  if (mode === "off") return NextResponse.next();
  const nonce = newNonce();
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(cspHeaderName(mode), csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|icons/|fondo/|icon.png|apple-icon.png|manifest.webmanifest|favicon.ico).*)",
      // Las precargas del enrutador no renderizan HTML: no necesitan política propia.
      missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
    },
  ],
};
