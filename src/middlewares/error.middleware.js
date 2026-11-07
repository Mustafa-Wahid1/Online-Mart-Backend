'use strict';

const logger = require('../utils/logger');
const env = require('../config/env');

const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    statusCode: 404,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    error: 'Not Found',
  });
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let error = err.error || message;

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join('; ');
    error = 'Validation Error';
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `Duplicate value for ${field}`;
    error = 'Conflict';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
    error = 'Bad Request';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
    error = 'Unauthorized';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired. Please login again.';
    error = 'Unauthorized';
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
        method: req.method,
        url: req.originalUrl,
      },
      'Operational error'
    );
  }

  const body = {
    statusCode,
    message: statusCode === 500 && env.isProd ? 'Internal Server Error' : message,
    error: statusCode === 500 && env.isProd ? 'Internal Server Error' : error,
  };

  res.status(statusCode).json(body);
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
