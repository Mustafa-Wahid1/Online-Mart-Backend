'use strict';

const nodemailer = require('nodemailer');
const env = require('../../config/env');
const logger = require('../../utils/logger');

const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'outlook.com', 'hotmail.com',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'mail.com', 'yandex.com',
]);

const TRANSIENT_CODES = new Set([
  'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'EDNS', 'ENOTFOUND', 'EAI_AGAIN',
]);
const TRANSIENT_SMTP = new Set([421, 450, 451, 452]);
const MAX_RETRIES = 2;
const BACKOFF_MS = [500, 1500];

let transporter = null;
let warnedNotConfigured = false;
let warnedFreeDomain = false;
let timezone = null;

const isConfigured = () =>
  Boolean(env.MAIL_ENABLED && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM_EMAIL);

/** Logs ONE clear warning the first time something tries to send without configuration. */
const warnNotConfiguredOnce = () => {
  if (warnedNotConfigured) return;
  warnedNotConfigured = true;
  const reason = !env.MAIL_ENABLED
    ? 'MAIL_ENABLED=false'
    : 'SMTP_USER, SMTP_PASS or MAIL_FROM_EMAIL is empty';
  logger.warn(`Email is not configured (${reason}) — emails are skipped until it is set`);
};

const warnFreeDomainOnce = () => {
  if (warnedFreeDomain) return;
  const domain = String(env.MAIL_FROM_EMAIL).split('@')[1];
  if (domain && FREE_MAIL_DOMAINS.has(domain.toLowerCase())) {
    warnedFreeDomain = true;
    logger.warn(
      { domain },
      'MAIL_FROM_EMAIL is on a free-mail domain: deliverability will be poor. Use a sender on your own authenticated domain.'
    );
  }
};

/** Lazy singleton. */
const getTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false, // STARTTLS on 587
    requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10000,
    socketTimeout: 15000,
    greetingTimeout: 10000,
  });
  return transporter;
};

const isTransient = (err) => {
  if (!err) return false;
  if (TRANSIENT_CODES.has(err.code)) return true;
  if (TRANSIENT_SMTP.has(Number(err.responseCode))) return true;
  return false;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Low-level send with retry on transient errors only. Throws the last error. */
const send = async ({ to, toName, subject, html, text }) => {
  warnFreeDomainOnce();
  const mail = {
    from: { name: env.MAIL_FROM_NAME, address: env.MAIL_FROM_EMAIL },
    replyTo: env.MAIL_FROM_EMAIL,
    to: toName ? { name: String(toName).replace(/[\r\n"<>]/g, ' ').trim(), address: to } : to,
    subject,
    html,
    text,
  };

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const info = await getTransporter().sendMail(mail);
      return { messageId: info && info.messageId ? String(info.messageId) : null };
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES || !isTransient(err)) break;
      logger.warn({ attempt: attempt + 1, code: err.code || err.responseCode }, 'Email send failed, retrying');
      await sleep(BACKOFF_MS[attempt] || 1500);
    }
  }
  throw lastErr;
};

/** Optional startup check. Non-fatal: only logs. */
const verifyConnection = async () => {
  if (!isConfigured()) {
    warnNotConfiguredOnce();
    return false;
  }
  try {
    await getTransporter().verify();
    logger.info({ host: env.SMTP_HOST, port: env.SMTP_PORT }, 'SMTP connection verified');
    return true;
  } catch (err) {
    logger.warn({ err: err.message }, 'SMTP verification failed (emails may not be delivered)');
    return false;
  }
};

/** MAIL_TIMEZONE, validated once; falls back to UTC. */
const getTimezone = () => {
  if (timezone) return timezone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: env.MAIL_TIMEZONE });
    timezone = env.MAIL_TIMEZONE;
  } catch {
    logger.warn({ MAIL_TIMEZONE: env.MAIL_TIMEZONE }, 'Invalid MAIL_TIMEZONE, using UTC');
    timezone = 'UTC';
  }
  return timezone;
};

module.exports = { isConfigured, warnNotConfiguredOnce, send, verifyConnection, getTimezone };
