'use strict';

const { toString: moneyToString } = require('../../../utils/money');
const { getTimezone } = require('../mailer');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes any user-controlled value before it goes into HTML. */
const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);

/** "$12.50" — same as the frontend money() helper. */
const money = (v) => `$${moneyToString(v === null || v === undefined ? 0 : v)}`;

/** "7 Nov 2026, 6:21 PM" in MAIL_TIMEZONE. */
const fmtDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: getTimezone(),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
  return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
};

/** "2026-11-07" in MAIL_TIMEZONE (used for once-a-day dedupe keys). */
const dayKey = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

module.exports = { esc, money, fmtDate, dayKey, firstName };
