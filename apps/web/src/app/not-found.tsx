import Link from "next/link";

/**
 * Página 404 propia: la de Next trae un elemento <style> en línea que la CSP (style-src 'self') bloquea. Usa solo las
 * clases de globals.css.
 */
export default function NotFound() {
  return (
    <main className="not-found">
      <div className="card">
        <h1>Página no encontrada</h1>
        <p className="muted">La dirección no existe o ya no está disponible.</p>
        <Link className="btn btn-primary" href="/">Ir al inicio</Link>
      </div>
    </main>
  );
}
