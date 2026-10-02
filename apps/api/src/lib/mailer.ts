import nodemailer from "nodemailer";
import { cfg } from "../config";

const transport = cfg.SMTP_URL ? nodemailer.createTransport(cfg.SMTP_URL) : null;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const ROLE_LABEL: Record<string, string> = { OPERATOR: "Operador", ADMIN: "Administrador", SUPERADMIN: "Superadministrador" };

/** Devuelve true si el correo salió. Sin SMTP configurado devuelve false (el enlace se muestra en el panel). */
export async function sendMail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!transport) {
    console.log(`\n[correo no configurado] Para: ${to}\n${subject}\n${text}\n`);
    return false;
  }
  try {
    await transport.sendMail({ from: cfg.MAIL_FROM, to, subject, text, html });
    return true;
  } catch (e) {
    console.error("No se pudo enviar el correo:", (e as Error).message);
    return false;
  }
}

export function sendInvitationEmail(p: { to: string; orgName: string; inviterName: string; role: string; url: string; days: number }) {
  const role = ROLE_LABEL[p.role] ?? p.role;
  const subject = `${p.inviterName} te invitó a Peregrinos`;
  const text =
    `Hola,\n\n${p.inviterName} te invitó a sumarte a ${p.orgName} en Peregrinos con el nivel: ${role}.\n\n` +
    `Crea tu clave y entra desde este enlace (vence en ${p.days} días y sirve una sola vez):\n${p.url}\n\n` +
    `Si no esperabas esta invitación, ignora este mensaje.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;color:#17324D">
<h2 style="color:#0B3158">Te invitaron a Peregrinos</h2>
<p><b>${esc(p.inviterName)}</b> te invitó a sumarte a <b>${esc(p.orgName)}</b> con el nivel <b>${esc(role)}</b>.</p>
<p><a href="${esc(p.url)}" style="display:inline-block;background:#1677FF;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700">Crear mi clave y entrar</a></p>
<p style="color:#6D7D8E;font-size:13px">El enlace vence en ${p.days} días y sirve una sola vez. Si no esperabas esta invitación, ignora este mensaje.</p></div>`;
  return sendMail(p.to, subject, text, html);
}
