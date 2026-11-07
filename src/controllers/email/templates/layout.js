'use strict';

const env = require('../../../config/env');
const { esc } = require('./format');

const C = {
  primary: '#45811b',
  primaryDark: '#376715',
  soft: '#edf3cf',
  muted: '#f4faee',
  border: '#e3ebdd',
  text: '#1b2a1b',
  textMuted: '#5e6b5e',
  danger: '#b42318',
  dangerBg: '#fee4e2',
  warnBg: '#fef3c7',
  warn: '#92400e',
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const url = (path) => `${env.FRONTEND_URL}${path}`;

/* ---------- building blocks: each returns { html, text } ---------- */

const p = (text) => ({
  html: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${C.text};">${esc(text)}</p>`,
  text,
});

const callout = (text, tone = 'info') => {
  const t = { info: [C.soft, C.primaryDark], danger: [C.dangerBg, C.danger], warn: [C.warnBg, C.warn] }[tone];
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="background:${t[0]};border-left:4px solid ${t[1]};border-radius:6px;padding:12px 16px;font-size:14px;line-height:1.5;color:${t[1]};font-weight:600;">${esc(text)}</td></tr></table>`,
    text,
  };
};

const kv = (rows) => {
  const list = rows.filter((r) => r && r[1] !== undefined && r[1] !== null && r[1] !== '');
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid ${C.border};border-radius:8px;">${list
      .map(
        ([k, v], i) =>
          `<tr><td style="padding:10px 14px;font-size:13px;color:${C.textMuted};${i ? `border-top:1px solid ${C.border};` : ''}width:38%;vertical-align:top;">${esc(k)}</td><td style="padding:10px 14px;font-size:14px;color:${C.text};font-weight:600;${i ? `border-top:1px solid ${C.border};` : ''}vertical-align:top;">${esc(v)}</td></tr>`
      )
      .join('')}</table>`,
    text: list.map(([k, v]) => `${k}: ${v}`).join('\n'),
  };
};

/** rows: [{ name, qty, price }] — price already formatted. */
const table = (head, rows) => ({
  html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid ${C.border};border-radius:8px;border-collapse:separate;"><tr>${head
    .map(
      (h, i) =>
        `<th align="${i === 0 ? 'left' : 'right'}" style="padding:10px 14px;background:${C.muted};font-size:12px;color:${C.textMuted};text-transform:uppercase;letter-spacing:.04em;">${esc(h)}</th>`
    )
    .join('')}</tr>${rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (c, i) =>
              `<td align="${i === 0 ? 'left' : 'right'}" style="padding:10px 14px;border-top:1px solid ${C.border};font-size:14px;color:${C.text};">${esc(c)}</td>`
          )
          .join('')}</tr>`
    )
    .join('')}</table>`,
  text: rows.map((r) => r.join(' | ')).join('\n'),
});

/** Big, clear 6-digit code. */
const otpBox = (code) => ({
  html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td align="center" style="background:${C.muted};border:1px dashed ${C.primary};border-radius:10px;padding:18px 10px;"><span style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:${C.primaryDark};">${esc(code)}</span></td></tr></table>`,
  text: `Your code: ${code}`,
});

/**
 * Wraps content in the branded layout.
 * Returns { html, text }. Single column, max 600px, table based, inline CSS, no external images.
 */
const render = ({ preheader = '', heading, blocks = [], cta = null, footerNote = '' }) => {
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr><td align="center" bgcolor="${C.primary}" style="border-radius:8px;"><a href="${esc(cta.url)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(cta.label)}</a></td></tr></table><p style="margin:8px 0 0;font-size:12px;color:${C.textMuted};word-break:break-all;">Button not working? Open this link: <a href="${esc(cta.url)}" style="color:${C.primary};">${esc(cta.url)}</a></p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f6ee;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f6ee;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6ee;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid ${C.border};overflow:hidden;font-family:${FONT};">
<tr><td style="background:${C.primary};padding:20px 28px;"><span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:.2px;">OnlineMart</span></td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${C.text};">${esc(heading)}</h1>
${blocks.map((b) => b.html).join('\n')}
${button}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid ${C.border};font-size:12px;line-height:1.5;color:${C.textMuted};">${esc(footerNote || 'You are receiving this email because of activity on your OnlineMart account.')}<br>&copy; OnlineMart</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `OnlineMart — ${heading}`,
    '',
    ...blocks.map((b) => b.text),
    ...(cta ? ['', `${cta.label}: ${cta.url}`] : []),
    '',
    '--',
    footerNote || 'You are receiving this email because of activity on your OnlineMart account.',
  ].join('\n');

  return { html, text };
};

module.exports = { render, p, callout, kv, table, otpBox, url, C };
