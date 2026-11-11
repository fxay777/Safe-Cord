const nodemailer = require('nodemailer');

// O SMTP é opcional: se as variáveis não estiverem no .env, o código de verificação
// é impresso no console do servidor em vez de enviado. Assim dá pra testar o app inteiro
// sem configurar email nenhum, e quando você plugar o SMTP tudo passa a sair por email
// sem mudar uma linha de código.
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || 'SafeCord <nao-responda@safecord.app>';

const smtpConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 usa TLS direto; 587 usa STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function isSmtpConfigured() {
  return smtpConfigured;
}

function verificationEmailHtml({ username, code }) {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#0B0F14;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F14;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#161C25;border:1px solid #262E3B;border-radius:20px;overflow:hidden;">
          <tr><td style="padding:28px 28px 8px;">
            <div style="font-size:20px;font-weight:700;color:#EAF2F1;letter-spacing:-0.3px;"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#1A75FF;margin-right:8px;vertical-align:middle;"></span>SafeCord</div>
            <p style="margin:14px 0 0;color:#9FB0AE;font-size:14px;line-height:1.55;">
              Oi, <strong style="color:#EAF2F1;">${escapeHtml(username)}</strong>! Use o código abaixo pra confirmar seu email e liberar sua conta.
            </p>
          </td></tr>
          <tr><td style="padding:20px 28px;">
            <div style="background:#0B0F14;border:1px solid #262E3B;border-radius:14px;padding:18px;text-align:center;">
              <div style="font-size:32px;letter-spacing:8px;font-weight:800;color:#3D8BFF;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(code)}</div>
            </div>
            <p style="margin:16px 0 0;color:#5C6E6C;font-size:12px;line-height:1.55;">
              O código vale por 30 minutos. Se não foi você que criou essa conta, pode ignorar este email.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Envia o código de verificação. Retorna { delivered, devCode }:
 * - delivered: true se saiu por SMTP de verdade
 * - devCode: o código, devolvido só quando NÃO há SMTP (pra mostrar na tela em modo dev)
 */
async function sendVerificationEmail({ to, username, code }) {
  if (!smtpConfigured) {
    console.log('\n──────────────────────────────────────────');
    console.log(`[email] SMTP não configurado — modo desenvolvimento`);
    console.log(`    Para: ${to}`);
    console.log(`    Código de verificação: ${code}`);
    console.log('    (configure SMTP_HOST/SMTP_USER/SMTP_PASS no .env pra enviar de verdade)');
    console.log('──────────────────────────────────────────\n');
    return { delivered: false, devCode: code };
  }

  await transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject: `${code} é o seu código do SafeCord`,
    text: `Oi, ${username}! Seu código de verificação do SafeCord é ${code}. Ele vale por 30 minutos.`,
    html: verificationEmailHtml({ username, code }),
  });

  return { delivered: true, devCode: null };
}

module.exports = { sendVerificationEmail, isSmtpConfigured };
