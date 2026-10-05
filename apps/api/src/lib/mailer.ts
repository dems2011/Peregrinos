import nodemailer from "nodemailer";
import { cfg } from "../config";

const transport = cfg.SMTP_URL
  ? nodemailer.createTransport(cfg.SMTP_URL)
  : null;

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!
  );

const ROLE_LABEL: Record<string, string> = {
  OPERATOR: "Operador",
  ADMIN: "Administrador",
  SUPERADMIN: "Superadministrador",
};

/** Devuelve true si el correo salió. Sin SMTP configurado devuelve false. */
export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<boolean> {
  if (!transport) {
    console.log(
      `\n[correo no configurado] Para: ${to}\n${subject}\n${text}\n`
    );
    return false;
  }

  try {
    await transport.sendMail({
      from: cfg.MAIL_FROM,
      to,
      subject,
      text,
      html,
    });

    return true;
  } catch (e) {
    console.error(
      "No se pudo enviar el correo:",
      (e as Error).message
    );
    return false;
  }
}

export function sendInvitationEmail(p: {
  to: string;
  orgName: string;
  inviterName: string;
  role: string;
  url: string;
  days: number;
}) {
  const role = ROLE_LABEL[p.role] ?? p.role;

  const subject = `${p.inviterName} te invitó a Peregrinos`;

  const text =
    `Hola,\n\n` +
    `${p.inviterName} te invitó a sumarte a ${p.orgName} en Peregrinos con el nivel: ${role}.\n\n` +
    `Crea tu clave y entra desde este enlace (vence en ${p.days} días y sirve una sola vez):\n${p.url}\n\n` +
    `Si no esperabas esta invitación, ignora este mensaje.`;

  const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;color:#17324D">
  <h2 style="color:#0B3158">Te invitaron a Peregrinos</h2>
  <p>
    <b>${esc(p.inviterName)}</b> te invitó a sumarte a
    <b>${esc(p.orgName)}</b> con el nivel <b>${esc(role)}</b>.
  </p>
  <p>
    <a
      href="${esc(p.url)}"
      style="display:inline-block;background:#1677FF;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700"
    >
      Crear mi clave y entrar
    </a>
  </p>
  <p style="color:#6D7D8E;font-size:13px">
    El enlace vence en ${p.days} días y sirve una sola vez.
    Si no esperabas esta invitación, ignora este mensaje.
  </p>
</div>`;

  return sendMail(p.to, subject, text, html);
}

export function sendEmailVerification(p: {
  to: string;
  name: string;
  url: string;
  hours: number;
}) {
  const subject = "Verifica tu correo en Peregrinos";

  const text =
    `Hola ${p.name},\n\n` +
    `Gracias por registrarte en Peregrinos.\n\n` +
    `Para activar tu cuenta, verifica tu correo desde este enlace:\n${p.url}\n\n` +
    `El enlace vence en ${p.hours} horas.\n\n` +
    `Si no creaste esta cuenta, puedes ignorar este mensaje.`;

  const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#17324D">
  <h2 style="color:#0B3158">Verifica tu correo</h2>
  <p>Hola <b>${esc(p.name)}</b>.</p>
  <p>Gracias por registrarte en <b>Peregrinos</b>.</p>
  <p>Para activar tu cuenta, haz clic en el siguiente botón:</p>
  <p>
    <a
      href="${esc(p.url)}"
      style="display:inline-block;background:#1677FF;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700"
    >
      Verificar mi correo
    </a>
  </p>
  <p style="color:#6D7D8E;font-size:13px">
    El enlace vence en ${p.hours} horas.
    Si no creaste esta cuenta, puedes ignorar este mensaje.
  </p>
</div>`;

  return sendMail(p.to, subject, text, html);
}
/** A3: confirmación al solicitante de una nueva parroquia, con su enlace privado de seguimiento. */
export function sendOrganizationRequestReceived(p: { to: string; name: string; parishName: string; url: string }) {
  const subject = "Recibimos tu solicitud de parroquia en Peregrinos";
  const text =
    `Hola ${p.name},\n\n` +
    `Recibimos la solicitud para sumar "${p.parishName}" a Peregrinos. El equipo de la plataforma la revisará.\n\n` +
    `Puedes consultar su estado (y corregirla si fuera rechazada) desde este enlace privado:\n${p.url}\n\n` +
    `No compartas este enlace.`;
  const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#17324D">
  <h2 style="color:#0B3158">Solicitud recibida</h2>
  <p>Hola <b>${esc(p.name)}</b>.</p>
  <p>Recibimos la solicitud para sumar <b>${esc(p.parishName)}</b> a Peregrinos. El equipo de la plataforma la revisará.</p>
  <p><a href="${esc(p.url)}" style="display:inline-block;background:#1677FF;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700">Ver mi solicitud</a></p>
  <p style="color:#6D7D8E;font-size:13px">Este enlace es privado: no lo compartas.</p>
</div>`;
  return sendMail(p.to, subject, text, html);
}
