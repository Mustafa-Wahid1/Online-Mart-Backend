'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = null) {
    super(message);
    this.statusCode = statusCode;
    this.error = errorCode || message;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
