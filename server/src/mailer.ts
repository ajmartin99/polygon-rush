import nodemailer from 'nodemailer';
import type { Config } from './config.ts';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** False when no SMTP server is configured (development: codes are logged). */
  readonly real: boolean;
  send(mail: Mail): Promise<void>;
}

export function createMailer(cfg: Config, log: (msg: string) => void = console.log): Mailer {
  if (!cfg.smtpUrl) {
    return {
      real: false,
      async send(mail) {
        if (cfg.production) throw new Error('Email is not configured (SMTP_URL).');
        log(`[mail:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
      },
    };
  }
  const transport = nodemailer.createTransport(cfg.smtpUrl);
  return {
    real: true,
    async send(mail) {
      await transport.sendMail({ from: cfg.mailFrom, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, paragraphs: string[], code: string): string {
  return `<!doctype html><html><body style="margin:0;background:#1a1040;font-family:Arial,Helvetica,sans-serif;color:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="100%" style="max-width:520px;background:#2a1a6e;border-radius:16px" cellpadding="0" cellspacing="0"><tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:22px;color:#ffd23f">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(p)}</p>`).join('\n')}
<p style="font-size:34px;letter-spacing:8px;font-weight:bold;text-align:center;background:#1a1040;border-radius:12px;padding:14px;margin:18px 0">${esc(code)}</p>
<p style="font-size:12px;color:#c9c2ee;margin:0">The code expires in 15 minutes. If you didn't ask for this, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** 16+ player verifying their own email. */
export function verifyMail(to: string, code: string): Mail {
  const lines = [
    'Here is your code to turn on Free Chat in Polygon Rush.',
    'Free Chat is filtered: personal info, links and mean words are blocked, and messages are kept for 30 days so our safety team can check reports.',
  ];
  return { to, subject: `Your Polygon Rush code: ${code}`, text: `${lines.join('\n\n')}\n\nCode: ${code}\n\nThe code expires in 15 minutes.`, html: layout('Your Polygon Rush code', lines, code) };
}

/** Parent / guardian approving Free Chat for a 13-15 year old. */
export function parentConsentMail(to: string, code: string, publicUrl: string): Mail {
  const lines = [
    'Your teen asked to turn on Free Chat in Polygon Rush, and entered this email as their parent or guardian.',
    'Free Chat lets players aged 13 and up type short messages to other verified players in the same game room. Messages are filtered (phone numbers, emails, links, other apps, personal questions and rude words are blocked), every message can be reported, and messages are stored for 30 days so our safety team can investigate reports.',
    'If you are happy for your teen to use Free Chat, give them the code below to enter in the game. You can turn Free Chat off any time in Settings > Parental Controls, or delete the chat account at ' + `${publicUrl}/account/delete` + '.',
    'If you did not expect this email, do nothing: Free Chat stays off.',
  ];
  return {
    to,
    subject: 'Parent permission for Polygon Rush Free Chat',
    text: `${lines.join('\n\n')}\n\nCode: ${code}\n\nThe code expires in 15 minutes.`,
    html: layout('Can your teen use Free Chat?', lines, code),
  };
}

export function deleteMail(to: string, code: string): Mail {
  const lines = ['Use this code to delete your Polygon Rush chat account and its messages.'];
  return { to, subject: 'Delete your Polygon Rush chat account', text: `${lines[0]}\n\nCode: ${code}\n\nThe code expires in 15 minutes.`, html: layout('Delete your chat account', lines, code) };
}
