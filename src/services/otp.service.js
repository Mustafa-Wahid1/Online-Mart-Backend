'use strict';

const crypto = require('crypto');
const OtpCode = require('../models/OtpCode.model');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const PURPOSES = { VERIFY_EMAIL: 'VERIFY_EMAIL', RESET_PASSWORD: 'RESET_PASSWORD' };
const MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

/** HMAC key derived from JWT_SECRET + userId + purpose, so a hash is only valid for that exact code slot. */
const deriveKey = (userId, purpose) =>
  crypto.createHmac('sha256', env.JWT_SECRET).update(`otp:${String(userId)}:${purpose}`).digest();

const hashCode = (code, userId, purpose) =>
  crypto.createHmac('sha256', deriveKey(userId, purpose)).update(String(code)).digest('hex');

const matches = (code, stored, userId, purpose) => {
  const a = Buffer.from(hashCode(code, userId, purpose), 'hex');
  const b = Buffer.from(String(stored), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const secondsLeft = (until) => Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));

/** True when an unused, unexpired code exists that was not burnt by too many attempts. */
const hasActiveCode = async (userId, purpose) => {
  const doc = await OtpCode.findOne({ userId, purpose }).lean();
  return Boolean(doc && !doc.usedAt && doc.expiresAt > new Date() && doc.attempts < env.OTP_MAX_ATTEMPTS);
};

/**
 * Creates (replaces) the single active code for (user, purpose).
 * Returns { ok: true, code } or { ok: false, reason: 'COOLDOWN' | 'HOURLY_LIMIT', retryAfterSeconds }.
 * The raw code is only ever returned here, to be e-mailed; it is never stored or logged.
 */
const issue = async (user, purpose) => {
  const now = new Date();
  const existing = await OtpCode.findOne({ userId: user._id, purpose }).lean();

  let sendCount = 1;
  let sendWindowStart = now;

  if (existing) {
    const cooldownEnds = new Date(existing.lastSentAt.getTime() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000);
    if (cooldownEnds > now) {
      return { ok: false, reason: 'COOLDOWN', retryAfterSeconds: secondsLeft(cooldownEnds) };
    }
    const windowEnds = new Date(existing.sendWindowStart.getTime() + HOUR_MS);
    if (windowEnds > now) {
      if (existing.sendCount >= MAX_SENDS_PER_HOUR) {
        return { ok: false, reason: 'HOURLY_LIMIT', retryAfterSeconds: secondsLeft(windowEnds) };
      }
      sendCount = existing.sendCount + 1;
      sendWindowStart = existing.sendWindowStart;
    }
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + env.OTP_EXPIRES_MINUTES * 60 * 1000);
  const purgeAt = new Date(Math.max(expiresAt.getTime(), sendWindowStart.getTime() + HOUR_MS));

  try {
    await OtpCode.findOneAndUpdate(
      { userId: user._id, purpose },
      {
        $set: {
          email: user.email,
          codeHash: hashCode(code, user._id, purpose),
          expiresAt,
          attempts: 0,
          lastSentAt: now,
          usedAt: null,
          sendCount,
          sendWindowStart,
          purgeAt,
        },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    // Two simultaneous requests raced on the unique (userId, purpose) index.
    if (err && err.code === 11000) {
      return { ok: false, reason: 'COOLDOWN', retryAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS };
    }
    throw err;
  }

  return { ok: true, code };
};

/**
 * Verifies and consumes a code. Throws AppError on any failure.
 * Returns the consumed OtpCode row on success.
 */
const verify = async (user, purpose, code) => {
  const invalid = () => new AppError('Invalid or expired code. Please request a new one.', 400, 'OTP_INVALID');

  const doc = await OtpCode.findOne({ userId: user._id, purpose });
  if (!doc || doc.usedAt) throw invalid();
  if (doc.expiresAt <= new Date()) {
    throw new AppError('This code has expired. Please request a new one.', 400, 'OTP_EXPIRED');
  }
  if (doc.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw new AppError('Too many incorrect attempts. Please request a new code.', 400, 'OTP_TOO_MANY_ATTEMPTS');
  }

  // Count the attempt atomically BEFORE comparing, so parallel guesses cannot beat the limit.
  const counted = await OtpCode.findOneAndUpdate(
    { _id: doc._id, usedAt: null, attempts: { $lt: env.OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!counted) {
    throw new AppError('Too many incorrect attempts. Please request a new code.', 400, 'OTP_TOO_MANY_ATTEMPTS');
  }

  if (!matches(code, doc.codeHash, user._id, purpose)) {
    const remaining = env.OTP_MAX_ATTEMPTS - counted.attempts;
    if (remaining <= 0) {
      throw new AppError('Too many incorrect attempts. Please request a new code.', 400, 'OTP_TOO_MANY_ATTEMPTS');
    }
    throw new AppError(
      `Incorrect code. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`,
      400,
      'OTP_INVALID'
    );
  }

  // Single use: only one concurrent request can flip usedAt.
  const consumed = await OtpCode.findOneAndUpdate(
    { _id: doc._id, usedAt: null },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!consumed) throw invalid();
  return consumed;
};

/** Deletes every code of the user except the one that was just used. */
const deleteOthers = (userId, keepId) => OtpCode.deleteMany({ userId, _id: { $ne: keepId } });

module.exports = { PURPOSES, issue, verify, hasActiveCode, deleteOthers };
