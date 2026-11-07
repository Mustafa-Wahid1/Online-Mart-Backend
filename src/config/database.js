'use strict';
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info({ host: conn.connection.host, name: conn.connection.name }, 'MongoDB connected');
    return conn;
  } catch (err) {
    logger.error({ err: err.message }, 'MongoDB connection failed');
    process.exit(1);
  }
};

const disconnectDB = async () => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};

module.exports = { connectDB, disconnectDB };
