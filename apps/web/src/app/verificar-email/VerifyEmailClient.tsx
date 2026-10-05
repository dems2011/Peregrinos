"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = "loading" | "success" | "error";

export default function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Verificando tu correo...");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setStatus("error");
      setMessage("El enlace de verificación no contiene un token válido.");
      return;
    }

    const verify = async () => {
      try {
        const response = await fetch(
          `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.message ||
              data?.error ||
              "El enlace no es válido o ya venció."
          );
        }

        setStatus("success");
        setMessage(
          data?.message || "Correo verificado correctamente."
        );
      } catch (error) {
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo verificar el correo."
        );
      }
    };

    verify();
  }, [searchParams]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#f5f7fa",
        color: "#111827",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "#ffffff",
          borderRadius: "18px",
          padding: "36px 28px",
          boxShadow: "0 10px 35px rgba(0,0,0,0.10)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "70px",
            height: "70px",
            margin: "0 auto 20px",
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background:
              status === "success"
                ? "#dcfce7"
                : status === "error"
                  ? "#fee2e2"
                  : "#e5e7eb",
            fontSize: "34px",
          }}
        >
          {status === "loading"
            ? "…"
            : status === "success"
              ? "✓"
              : "!"}
        </div>

        <h1
          style={{
            margin: "0 0 14px",
            fontSize: "26px",
            fontWeight: 700,
            color: "#111827",
          }}
        >
          {status === "loading"
            ? "Verificando tu correo"
            : status === "success"
              ? "¡Correo verificado!"
              : "No se pudo verificar"}
        </h1>

        <p
          style={{
            margin: "0 auto 28px",
            lineHeight: 1.6,
            fontSize: "16px",
            color: "#374151",
          }}
        >
          {message}
        </p>

        {status === "success" && (
          <a
            href="/login"
            style={{
              display: "inline-block",
              padding: "13px 24px",
              borderRadius: "10px",
              background: "#1677ff",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Ir a iniciar sesión
          </a>
        )}

        {status === "error" && (
          <a
            href="/register"
            style={{
              display: "inline-block",
              padding: "13px 24px",
              borderRadius: "10px",
              background: "#1677ff",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Volver al registro
          </a>
        )}
      </section>
    </main>
  );
}