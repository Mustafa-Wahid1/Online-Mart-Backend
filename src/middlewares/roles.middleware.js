'use strict';

const AppError = require('../utils/AppError');

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authorization header missing', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
};

const requireCustomer = requireRole('CUSTOMER');
const requireAdmin = requireRole('ADMIN');

module.exports = {
  requireRole,
  requireCustomer,
  requireAdmin,
};
