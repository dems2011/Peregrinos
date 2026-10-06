"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { post } from "@/lib/api";
import { errorText } from "@/components/account/AccountContext";
import { PublicShell } from "@/components/PublicShell";

/**
 * Enlace personal del peregrino (/p/:token, emitido por el personal o al inscribirse). Canjea el token una vez
 * (POST /api/pilgrim/login { token } → cookie de sesión) y pasa a /p, así el token no queda en la barra ni en el historial.
 */
export default function EnlacePersonal() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  // En desarrollo el efecto corre dos veces: el canje se hace una sola.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // router.replace: la entrada /p/:token se reemplaza en el historial (un token que falló ya no sirve).
    post("/pilgrim/login", { token: decodeURIComponent(token) })
      .then(() => router.replace("/p"))
      .catch((e) => setErr(errorText(e, "No se pudo abrir tu enlace. Intenta nuevamente.")));
  }, [token, router]);

  return (
    <PublicShell subtitle="Mi inscripción">
      {!err ? <div className="acct-loading" role="status">Abriendo tu acceso…</div> : (
        <section className="card stack-sm">
          <div className="alert err" role="alert">{err}</div>
          <Link className="btn btn-primary" href="/p">Entrar con mi código</Link>
        </section>
      )}
    </PublicShell>
  );
}
