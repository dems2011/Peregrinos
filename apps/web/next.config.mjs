const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** @type {import('next').NextConfig} */
export default {
  // El navegador solo habla con el mismo origen; Next reenvía /api/* al backend.
  // Así las cookies httpOnly funcionan sin CORS ni configuración extra.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};
