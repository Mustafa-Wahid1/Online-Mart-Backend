'use strict';

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate.middleware');
const {
  authLimiter,
  otpSendIpLimiter,
  otpSendEmailLimiter,
  otpVerifyIpLimiter,
  otpVerifyEmailLimiter,
} = require('../middlewares/rateLimit.middleware');
const authMiddleware = require('../middlewares/auth.middleware');

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('phone').optional({ nullable: true }).isString().trim(),
    body('role').not().exists().withMessage('Role field is not allowed'),
  ],
  validate,
  authController.register
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  authController.login
);

const emailRule = body('email').isEmail().withMessage('Valid email is required').normalizeEmail();
const otpRule = body('otp')
  .isString()
  .trim()
  .matches(/^\d{6}$/)
  .withMessage('Enter the 6-digit code');

router.post(
  '/verify-email',
  otpVerifyIpLimiter,
  otpVerifyEmailLimiter,
  [emailRule, otpRule],
  validate,
  authController.verifyEmail
);

router.post(
  '/resend-verification',
  otpSendIpLimiter,
  otpSendEmailLimiter,
  [emailRule],
  validate,
  authController.resendVerification
);

router.post(
  '/forgot-password',
  otpSendIpLimiter,
  otpSendEmailLimiter,
  [emailRule],
  validate,
  authController.forgotPassword
);

router.post(
  '/reset-password',
  otpVerifyIpLimiter,
  otpVerifyEmailLimiter,
  [
    emailRule,
    otpRule,
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
  ],
  validate,
  authController.resetPassword
);

router.get('/me', authMiddleware, authController.me);

module.exports = router;
