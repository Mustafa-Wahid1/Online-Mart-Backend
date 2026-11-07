'use strict';

const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.isProd ? 'info' : 'debug',
  transport: env.isProd
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 },
      },
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'authorization',
      'req.headers.authorization',
      'body.password',
      'body.token',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'online-mart-backend',
    env: env.NODE_ENV,
  },
});

module.exports = logger;
