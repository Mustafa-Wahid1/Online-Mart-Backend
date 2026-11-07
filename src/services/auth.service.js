'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { onUserRegistered } = require('./notification.triggers');
const otpService = require('./otp.service');
const emailEvents = require('../infrastructure/email/email.events');
const { fireAndForget } = require('../infrastructure/email/email.service');

const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', env.BCRYPT_COST);

const publicUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
});

/**
 * Creates a fresh code and e-mails it AFTER returning (never blocks, never throws).
 * Returns the cooldown info so callers can tell the frontend when it may resend.
 */
const issueAndSend = async (user, purpose) => {
  const result = await otpService.issue(user, purpose);
  if (result.ok) {
    const send = purpose === otpService.PURPOSES.VERIFY_EMAIL ? emailEvents.sendVerifyOtp : emailEvents.sendResetOtp;
    fireAndForget(() => send({ user, code: result.code }));
  }
  return result;
};

const register = async ({ name, email, phone, password }) => {
  const existingEmail = await User.findOne({ email: email.toLowerCase() });
  if (existingEmail) {
    // Still unverified: do not create a duplicate, just send a new code (cooldown applies).
    if (existingEmail.emailVerified === false && existingEmail.isActive) {
      await issueAndSend(existingEmail, otpService.PURPOSES.VERIFY_EMAIL).catch((err) =>
        logger.error({ err: err.message }, 'Verification code issue failed')
      );
      return {
        user: publicUser(existingEmail),
        verificationRequired: true,
        resendAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      };
    }
    throw new AppError(
      'This email is already associated with another account.',
      409
    );
  }
  if (phone) {
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      throw new AppError(
        'This mobile number is already associated with another account.',
        409
      );
    }
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_COST);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    phone: phone || undefined,
    passwordHash,
    role: 'CUSTOMER',
    emailVerified: false,
  });

  await onUserRegistered(user);

  try {
    await issueAndSend(user, otpService.PURPOSES.VERIFY_EMAIL);
  } catch (err) {
    // The account exists; the user can always use "Resend code".
    logger.error({ err: err.message }, 'Verification code issue failed');
  }

  // No token is ever issued before the email is verified.
  return {
    user: publicUser(user),
    verificationRequired: true,
    resendAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
  };
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new AppError('Invalid email or password', 401);
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isActive) {
    throw new AppError('User account is deactivated. Please contact support.', 403);
  }

  // Existing accounts have no emailVerified field and are treated as verified.
  if (user.emailVerified === false) {
    try {
      if (!(await otpService.hasActiveCode(user._id, otpService.PURPOSES.VERIFY_EMAIL))) {
        await issueAndSend(user, otpService.PURPOSES.VERIFY_EMAIL);
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Verification code issue failed');
    }
    throw new AppError(
      'Please verify your email to continue. We sent a code to your email address.',
      403,
      'EMAIL_NOT_VERIFIED'
    );
  }

  const token = signToken(user);
  return {
    user: publicUser(user),
    token,
  };
};

const verifyEmail = async ({ email, otp }) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive || user.emailVerified !== false) {
    // Same answer as a wrong code: nothing to learn about the account.
    throw new AppError('Invalid or expired code. Please request a new one.', 400, 'OTP_INVALID');
  }

  await otpService.verify(user, otpService.PURPOSES.VERIFY_EMAIL, otp);

  user.emailVerified = true;
  await user.save();
  await otpService.deleteOthers(user._id, null);

  fireAndForget(() => emailEvents.welcome(user));

  return {
    user: publicUser(user),
    token: signToken(user),
  };
};

/** Always resolves; the caller responds to the client first and runs this in the background. */
const resendVerification = async ({ email }) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive || user.emailVerified !== false) return;
  await issueAndSend(user, otpService.PURPOSES.VERIFY_EMAIL);
};

/** Always resolves; the caller responds to the client first and runs this in the background. */
const forgotPassword = async ({ email }) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive) return;
  await issueAndSend(user, otpService.PURPOSES.RESET_PASSWORD);
};

const resetPassword = async ({ email, otp, password }) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !user.isActive) {
    throw new AppError('Invalid or expired code. Please request a new one.', 400, 'OTP_INVALID');
  }

  const used = await otpService.verify(user, otpService.PURPOSES.RESET_PASSWORD, otp);

  // Same method and cost as registration.
  user.passwordHash = await bcrypt.hash(password, env.BCRYPT_COST);
  user.passwordChangedAt = new Date();
  // emailVerified is intentionally untouched: resetting a password does not verify the email.
  await user.save();
  await otpService.deleteOthers(user._id, used._id);

  fireAndForget(() => emailEvents.passwordChanged(user, user.passwordChangedAt));

  return { message: 'Your password has been updated. Please log in.' };
};

const getMe = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError('User not found', 404);
  }
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    totalOrders: user.totalOrders,
    totalSpent: Number(user.totalSpent).toFixed(2),
    createdAt: user.createdAt,
  };
};

const signToken = (user) => {
  return jwt.sign(
    { id: user._id.toString() },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
};

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  getMe,
  signToken,
};
