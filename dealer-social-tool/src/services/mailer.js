// Transactional email through Resend's HTTP API. Without a key, emails are logged
// to the console so local development and self-hosting still work.
import { config } from '../config.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const outbox = []; // last few emails, useful in tests and the console fallback

export async function sendEmail({ to, subject, text, actionUrl, actionLabel, plainOnly = false }) {
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#16181d;max-width:520px">
    <p style="font-weight:700;font-size:18px">${esc(config.productName)}</p>
    ${text
      .split('\n\n')
      .map((p) => `<p>${esc(p)}</p>`)
      .join('')}
    ${actionUrl ? `<p><a href="${esc(actionUrl)}" style="display:inline-block;background:#2456e6;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(actionLabel || 'Open')}</a></p><p style="color:#667085;font-size:12px">Or paste this link: ${esc(actionUrl)}</p>` : ''}
  </div>`;
  const message = { to, subject, text: actionUrl ? `${text}\n\n${actionUrl}` : text };
  outbox.push(message);
  if (outbox.length > 20) outbox.shift();

  if (!config.resendApiKey) {
    if (config.env !== 'test') console.log(`[email → ${to}] ${subject}\n${message.text}\n`);
    return { delivered: false };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.emailFrom, to: [to], subject, ...(plainOnly ? {} : { html }), text: message.text }),
  });
  if (!res.ok) console.error(`Email to ${to} failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  return { delivered: res.ok };
}
