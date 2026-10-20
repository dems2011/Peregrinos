import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { PushHandler } from "@/components/PushHandler";

export const metadata: Metadata = {
  title: "Peregrinos",
  description: "La Iglesia más cerca de ti.",
  applicationName: "Peregrinos",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Peregrinos", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#0B3158", width: "device-width", initialScale: 1 };

/**
 * Render dinámico a propósito: cada respuesta lleva un nonce de CSP nuevo (src/middleware.ts) y Next lo aplica a sus
 * scripts al renderizar; una página prerenderizada en la compilación no lo tendría. Leer la cabecera lo garantiza.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers();
  return (
    <html lang="es">
      <body>
        <ConnectionStatus />
        {children}
        <PushHandler />
      </body>
    </html>
  );
}
