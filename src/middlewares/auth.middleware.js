'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const User = require('../models/User.model');

const PUBLIC_PATHS = [
  { method: 'GET', path: /^\/v1\/health$/ },
  { method: 'POST', path: /^\/v1\/auth\/register$/ },
  { method: 'POST', path: /^\/v1\/auth\/login$/ },
  { method: 'GET', path: /^\/v1\/categories$/ },
  { method: 'GET', path: /^\/v1\/products$/ },
  { method: 'GET', path: /^\/v1\/products\/[^/]+$/ },
  { method: 'POST', path: /^\/v1\/webhooks\/payments\/mock$/ },
];

const isPublic = (method, path) => {
  return PUBLIC_PATHS.some((p) => p.method === method && p.path.test(path));
};

const authMiddleware = async (req, res, next) => {
  if (isPublic(req.method, req.path) || isPublic(req.method, req.originalUrl.split('?')[0])) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next(new AppError('Authorization header missing', 401));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return next(new AppError('Invalid authorization header format', 401));
  }

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('name email role isActive passwordChangedAt');
    if (!user) {
      return next(new AppError('Invalid authentication token', 401));
    }
    if (!user.isActive) {
      return next(
        new AppError('User account is deactivated. Please contact support.', 403)
      );
    }
    // Tokens issued before a password reset stop working (only for users who reset a password).
    if (
      user.passwordChangedAt &&
      decoded.iat &&
      decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
    ) {
      return next(new AppError('Session expired. Please login again.', 401));
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
      return next(new AppError('Token has expired. Please login again.', 401));
    }
    return next(new AppError('Invalid authentication token', 401));
  }
};

module.exports = authMiddleware;
