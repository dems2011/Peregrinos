import type { Metadata, Viewport } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
