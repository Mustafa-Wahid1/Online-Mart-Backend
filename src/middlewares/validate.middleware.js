'use strict';

const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

/**
 * Express-validator middleware.
 * Returns a single readable message + attaches structured details for debugging.
 */
const validate = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  const errors = result.array();
  const message = errors.map((e) => e.msg).join('; ');

  const err = new AppError(message, 400, 'VALIDATION_ERROR');
  // Extra details (not sent to client by default, useful in logs / future expansion)
  err.details = errors.map((e) => ({
    field: e.path || e.param,
    message: e.msg,
    value: e.value,
  }));

  return next(err);
};

module.exports = validate;