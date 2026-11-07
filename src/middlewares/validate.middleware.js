'use strict';

const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((e) => e.msg)
      .join('; ');
    return next(new AppError(message, 400, 'Validation Error'));
  }
  next();
};

module.exports = validate;
