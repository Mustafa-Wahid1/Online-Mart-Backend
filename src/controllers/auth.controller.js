'use strict';

const authService = require('../services/auth.service');
const { success } = require('../utils/response');
const env = require('../config/env');
const logger = require('../utils/logger');

const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const result = await authService.verifyEmail(req.body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

/**
 * Responds first, works afterwards: the response is identical (and equally fast)
 * whether or not the account exists, so nothing can be learned from it.
 */
const respondThenRun = (res, name, work, message) => {
  success(res, { message, resendAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS });
  setImmediate(() => {
    Promise.resolve()
      .then(work)
      .catch((err) => logger.error({ err: err.message, action: name }, 'Background OTP task failed'));
  });
};

const resendVerification = (req, res) =>
  respondThenRun(
    res,
    'resendVerification',
    () => authService.resendVerification(req.body),
    'If your account needs verification, we sent a new code.'
  );

const forgotPassword = (req, res) =>
  respondThenRun(
    res,
    'forgotPassword',
    () => authService.forgotPassword(req.body),
    'If an account exists for that email, we sent a code'
  );

const resetPassword = async (req, res, next) => {
  try {
    const result = await authService.resetPassword(req.body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

const me = async (req, res, next) => {
  try {
    const result = await authService.getMe(req.user.id);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  me,
};
