'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const User = require('../models/User.model');

const prefix = `/${env.URL_PREFIX}`;

/**
 * Public routes that skip authentication.
 * Paths are relative to the API prefix (e.g. /v1).
 * Keep this list short and explicit.
 */
const PUBLIC_ROUTES = [
  { method: 'GET', path: '/health' },
  { method: 'POST', path: '/auth/register' },
  { method: 'POST', path: '/auth/login' },
  { method: 'POST', path: '/auth/verify-email' },
  { method: 'POST', path: '/auth/resend-verification' },
  { method: 'POST', path: '/auth/forgot-password' },
  { method: 'POST', path: '/auth/reset-password' },
  { method: 'GET', path: '/categories' },
  { method: 'GET', path: '/products' },
  { method: 'GET', path: '/products/:id' },
  { method: 'POST', path: '/webhooks/payments/mock' },
  { method: 'POST', path: '/contact' },
  { method: 'GET', path: '/faqs' },
  { method: 'GET', path: '/orders/track' },
];

/** Convert a simple path pattern (`/products/:id`) into a RegExp. */
const toRegex = (pattern) => {
  const escaped = pattern
    .replace(/:[^/]+/g, '[^/]+')
    .replace(/\//g, '\\/');
  return new RegExp(`^${prefix}${escaped}$`);
};

const PUBLIC_PATHS = PUBLIC_ROUTES.map((r) => ({
  method: r.method,
  path: toRegex(r.path),
}));

const isPublic = (method, path) =>
  PUBLIC_PATHS.some((p) => p.method === method && p.path.test(path));

const authMiddleware = async (req, res, next) => {
  const cleanPath = req.originalUrl.split('?')[0];

  if (isPublic(req.method, req.path) || isPublic(req.method, cleanPath)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next(new AppError('Authorization header missing', 401, 'UNAUTHORIZED'));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return next(new AppError('Invalid authorization header format', 401, 'UNAUTHORIZED'));
  }

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.id).select(
      'name email role isActive passwordChangedAt'
    );

    if (!user) {
      return next(new AppError('Invalid authentication token', 401, 'UNAUTHORIZED'));
    }

    if (!user.isActive) {
      return next(
        new AppError(
          'User account is deactivated. Please contact support.',
          403,
          'ACCOUNT_DEACTIVATED'
        )
      );
    }

    // Invalidate tokens issued before a password change
    if (
      user.passwordChangedAt &&
      decoded.iat &&
      decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
    ) {
      return next(new AppError('Session expired. Please login again.', 401, 'SESSION_EXPIRED'));
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      name: user.name,
      email: user.email,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token has expired. Please login again.', 401, 'TOKEN_EXPIRED'));
    }
    return next(new AppError('Invalid authentication token', 401, 'UNAUTHORIZED'));
  }
};

module.exports = authMiddleware;