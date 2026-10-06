/** API del servicio Render de producción: respaldo cuando el servicio web de Render no define API_URL. */
const RENDER_API_URL = "https://peregrinos.onrender.com";
// Render define RENDER=true en el build y en ejecución. Sin API_URL, apuntar a localhost dejaba /api sin backend.
const API_URL = process.env.API_URL ?? (process.env.RENDER ? RENDER_API_URL : "http://localhost:4000");

/** @type {import('next').NextConfig} */
export default {
  // El navegador solo habla con el mismo origen; Next reenvía /api/* al backend.
  // Así las cookies httpOnly funcionan sin CORS ni configuración extra.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};
