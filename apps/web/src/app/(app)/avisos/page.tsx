"use client";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useApp } from "@/components/AppContext";
import { ParishNotifications } from "@/components/ParishNotifications";
import { ErrorBox, Loading, Page } from "@/components/ui";

/** Acceso directo «Aviso» del superadministrador: enviar avisos a los seguidores de la parroquia. */
export default function Aviso() {
  const { me } = useApp();
  const sa = me.user.role === "SUPERADMIN";
  const prof = useLoad(() => (sa ? api<{ profile: { followerCount: number } }>("/organization/profile") : Promise.resolve(null)), [sa]);
  if (!sa) return <Page title="Aviso"><div className="alert warn">Solo el superadministrador puede enviar avisos a los seguidores.</div></Page>;
  return (
    <Page title="Aviso">
      <ErrorBox msg={prof.error} />
      {prof.data ? <ParishNotifications followers={prof.data.profile.followerCount} /> : !prof.error && <Loading />}
    </Page>
  );
}
