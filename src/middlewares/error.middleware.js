'use strict';

const logger = require('../utils/logger');
const env = require('../config/env');

const notFoundHandler = (req, res) => {
  res.status(404).json({
    statusCode: 404,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    error: 'Not Found',
    code: 'NOT_FOUND',
  });
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || null;
  let error = err.error || message;

  // Mongoose / JWT specific mapping
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join('; ');
    error = 'Validation Error';
    code = 'VALIDATION_ERROR';
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `Duplicate value for ${field}`;
    error = 'Conflict';
    code = 'DUPLICATE';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
    error = 'Bad Request';
    code = 'INVALID_ID';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
    error = 'Unauthorized';
    code = 'UNAUTHORIZED';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired. Please login again.';
    error = 'Unauthorized';
    code = 'TOKEN_EXPIRED';
  }

  if (statusCode >= 500) {
    logger.error(
      {
        err: {
          message: err.message,
          stack: env.isProd ? undefined : err.stack,
          name: err.name,
        },
        method: req.method,
        url: req.originalUrl,
      },
      'Unhandled error'
    );
  } else {
    logger.warn(
      {
        statusCode,
        message,
        code,
        method: req.method,
        url: req.originalUrl,
      },
      'Operational error'
    );
  }

  const isServerError = statusCode >= 500 && env.isProd;

  const body = {
    statusCode,
    message: isServerError ? 'Internal Server Error' : message,
    error: isServerError ? 'Internal Server Error' : error,
  };

  // Always expose machine-readable code when available (frontend uses it)
  if (code && !isServerError) {
    body.code = code;
  }

  res.status(statusCode).json(body);
};

module.exports = {
  notFoundHandler,
  errorHandler,
};