'use strict';

const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const required = [
  'NODE_ENV',
  'PORT',
  'URL_PREFIX',
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'BCRYPT_COST',
  'CORS_ORIGINS',
  'PAYMENT_WEBHOOK_SECRET',
];

const missing = required.filter((key) => !process.env[key] || String(process.env[key]).trim() === '');
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}

const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
if (webhookSecret.length < 16) {
  console.error('PAYMENT_WEBHOOK_SECRET must be at least 16 characters long');
  process.exit(1);
}

const allowedEnvs = ['development', 'test', 'production'];
if (!allowedEnvs.includes(process.env.NODE_ENV)) {
  console.error(`NODE_ENV must be one of: ${allowedEnvs.join(', ')}`);
  process.exit(1);
}

const env = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  URL_PREFIX: process.env.URL_PREFIX || 'v1',
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  BCRYPT_COST: parseInt(process.env.BCRYPT_COST, 10) || 12,
  CORS_ORIGINS: process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  PAYMENT_WEBHOOK_SECRET: webhookSecret,
  PAYMENT_GATEWAY: 'mock',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  ADMIN_NAME: process.env.ADMIN_NAME || 'Admin',
  IMAGEKIT_PUBLIC_KEY: process.env.IMAGEKIT_PUBLIC_KEY || '',
  IMAGEKIT_PRIVATE_KEY: process.env.IMAGEKIT_PRIVATE_KEY || '',
  IMAGEKIT_URL_ENDPOINT: process.env.IMAGEKIT_URL_ENDPOINT || '',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  MAIL_FROM_EMAIL: process.env.MAIL_FROM_EMAIL || '',
  MAIL_FROM_NAME: process.env.MAIL_FROM_NAME || 'OnlineMart',
  MAIL_ENABLED: String(process.env.MAIL_ENABLED || 'true').toLowerCase() !== 'false',
  MAIL_TIMEZONE: process.env.MAIL_TIMEZONE || 'UTC',
  FRONTEND_URL: (process.env.FRONTEND_URL || process.env.CORS_ORIGINS.split(',')[0] || '').trim().replace(/\/+$/, ''),
  OTP_EXPIRES_MINUTES: parseInt(process.env.OTP_EXPIRES_MINUTES, 10) || 10,
  OTP_MAX_ATTEMPTS: parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5,
  OTP_RESEND_COOLDOWN_SECONDS: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 10) || 60,
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  isDev: process.env.NODE_ENV === 'development',
};

module.exports = env;