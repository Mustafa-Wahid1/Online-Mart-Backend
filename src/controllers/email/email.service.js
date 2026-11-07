'use strict';

const EmailLog = require('../../models/EmailLog.model');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const mailer = require('./mailer');

const isOtpType = (type) => String(type).startsWith('OTP_');

const logRow = async (row) => {
  try {
    await EmailLog.create(row);
  } catch (err) {
    logger.warn({ err: err.message, type: row.type }, 'Email log write failed');
  }
};

/**
 * Single entry point for every email. NEVER throws.
 * `otp` is only used for the development console print and is never logged or stored.
 * Returns { status: 'SENT' | 'FAILED' | 'SKIPPED' | 'DUPLICATE' | 'NOT_CONFIGURED' }.
 */
const sendEmail = async ({ to, toName, type, subject, html, text, dedupeKey, otp }) => {
  try {
    if (!to) return { status: 'SKIPPED' };
    const address = String(to).trim().toLowerCase();

    if (!mailer.isConfigured()) {
      mailer.warnNotConfiguredOnce();
      if (env.isDev && otp && isOtpType(type)) {
        // eslint-disable-next-line no-console
        console.log(`[DEV ONLY] OTP for ${address}: ${otp}`);
      }
      return { status: 'NOT_CONFIGURED' };
    }

    // OTP emails are never deduped: every resend carries a new code.
    let claimId = null;
    if (dedupeKey && !isOtpType(type)) {
      try {
        const claim = await EmailLog.create({ to: address, type, dedupeKey, status: 'PENDING' });
        claimId = claim._id;
      } catch (err) {
        if (err && err.code === 11000) return { status: 'DUPLICATE' };
        throw err;
      }
    }

    try {
      const { messageId } = await mailer.send({ to: address, toName, subject, html, text });
      if (claimId) {
        await EmailLog.updateOne({ _id: claimId }, { $set: { status: 'SENT', messageId } });
      } else {
        await logRow({ to: address, type, status: 'SENT', messageId });
      }
      return { status: 'SENT', messageId };
    } catch (err) {
      const message = String(err && err.message ? err.message : err).slice(0, 300);
      logger.error({ type, err: message, code: err && (err.code || err.responseCode) }, 'Email send failed');
      if (claimId) {
        // Release the key: the email was never delivered, so a later trigger may try again.
        await EmailLog.updateOne(
          { _id: claimId },
          { $set: { status: 'FAILED', error: message }, $unset: { dedupeKey: '' } }
        ).catch(() => {});
      } else {
        await logRow({ to: address, type, status: 'FAILED', error: message });
      }
      return { status: 'FAILED' };
    }
  } catch (err) {
    logger.error({ type, err: err && err.message }, 'Email service error');
    return { status: 'FAILED' };
  }
};

/** Records that an email was intentionally not sent (inactive recipient, etc.). */
const recordSkipped = (to, type, reason) =>
  logRow({ to: String(to || 'unknown'), type, status: 'SKIPPED', error: reason });

/**
 * Runs `fn` after the current tick, never awaited by the caller, never throws.
 * Use for every email so the original operation is never slowed down or broken.
 */
const fireAndForget = (fn) => {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch((err) => logger.error({ err: err && err.message }, 'Email dispatch failed'));
  });
};

module.exports = { sendEmail, recordSkipped, fireAndForget };
