import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
