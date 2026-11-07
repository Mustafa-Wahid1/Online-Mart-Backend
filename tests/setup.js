'use strict';

// Ensure test env before any app import
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '3001';
process.env.URL_PREFIX = process.env.URL_PREFIX || 'v1';
process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/onlinemart_test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long!!';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
process.env.BCRYPT_COST = process.env.BCRYPT_COST || '4'; // faster for tests
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:3001';
process.env.PAYMENT_WEBHOOK_SECRET =
  process.env.PAYMENT_WEBHOOK_SECRET || 'test-webhook-secret-16';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@onlinemart.test';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';
process.env.ADMIN_NAME = process.env.ADMIN_NAME || 'Test Admin';
