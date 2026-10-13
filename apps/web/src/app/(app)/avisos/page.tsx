"use client";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useApp } from "@/components/AppContext";
import { ParishNotifications } from "@/components/ParishNotifications";
import { ErrorBox, Loading, Page } from "@/components/ui";

/** «Aviso»: enviar avisos a los seguidores de la parroquia (B5: permiso notice:send). */
export default function Aviso() {
  const { me, can } = useApp();
  const sa = can("notice:send");
  const prof = useLoad(() => (sa ? api<{ profile: { followerCount: number } }>("/organization/profile") : Promise.resolve(null)), [sa]);
  if (!sa) return <Page title="Aviso"><div className="alert warn">No tienes permiso para enviar avisos a los seguidores.</div></Page>;
  return (
    <Page title="Aviso">
      <ErrorBox msg={prof.error} />
      {prof.data ? <ParishNotifications followers={prof.data.profile.followerCount} viewerId={me.user.id} /> : !prof.error && <Loading />}
    </Page>
  );
}
