'use strict';

const success = (res, data, statusCode = 200, meta = null) => {
  const body = { data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

const error = (res, statusCode, message, errorCode = null) => {
  const body = {
    statusCode,
    message,
    error: errorCode || message,
  };
  return res.status(statusCode).json(body);
};

module.exports = {
  success,
  error,
};
