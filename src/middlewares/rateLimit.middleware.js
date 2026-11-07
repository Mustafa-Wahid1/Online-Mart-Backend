'use strict';

const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    statusCode: 429,
    message: 'Too many requests, please try again later.',
    error: 'Too Many Requests',
  },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    statusCode: 429,
    message: 'Too many authentication attempts, please try again later.',
    error: 'Too Many Requests',
  },
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    statusCode: 429,
    message: 'Too many order requests, please try again later.',
    error: 'Too Many Requests',
  },
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    statusCode: 429,
    message: 'Too many payment initiation attempts, please try again later.',
    error: 'Too Many Requests',
  },
});

/* ---- OTP endpoints: stricter than authLimiter, per IP and per email ---- */

const tooMany = (message) => ({
  statusCode: 429,
  message,
  error: 'Too Many Requests',
});

// Key by the e-mail in the body (the IP limiter covers requests without one).
const emailKey = (req) => {
  const raw = req.body && typeof req.body.email === 'string' ? req.body.email : '';
  return `otp-email:${raw.trim().toLowerCase().slice(0, 255) || 'none'}`;
};

// Endpoints that send a code (resend-verification, forgot-password)
const otpSendIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many code requests. Please try again later.'),
});

const otpSendEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: emailKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many code requests for this email. Please try again later.'),
});

// Endpoints that check a code (verify-email, reset-password)
const otpVerifyIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many attempts. Please try again later.'),
});

const otpVerifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: emailKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many attempts for this email. Please try again later.'),
});

module.exports = {
  globalLimiter,
  authLimiter,
  orderLimiter,
  paymentLimiter,
  otpSendIpLimiter,
  otpSendEmailLimiter,
  otpVerifyIpLimiter,
  otpVerifyEmailLimiter,
};
