"use client";
import { ParishProfileEditor } from "@/components/ParishProfileEditor";

/** Ruta conservada (enlaces existentes): el perfil es también el Inicio del superadministrador. */
export default function PerfilParroquia() {
  return <ParishProfileEditor back="/configuracion" />;
}
