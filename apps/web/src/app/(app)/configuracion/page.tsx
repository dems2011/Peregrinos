"use client";
import { useApp } from "@/components/AppContext";
import { AdminMenu } from "@/components/AdminMenu";

/**
 * Configuración y administración (no dependen del evento activo), agrupadas por categoría y filtradas por permisos.
 * Lo del evento (datos, contactos, accesos) está en Evento. Para el superadministrador es su «Menú».
 */
export default function Configuracion() {
  const { me } = useApp();
  return <AdminMenu title={me.user.role === "SUPERADMIN" ? "Menú" : "Configuración"} />;
}
