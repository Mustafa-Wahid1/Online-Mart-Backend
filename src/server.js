'use strict';

const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/database');
const { isConfigured: isImageKitConfigured } = require('./infrastructure/imagekit/imagekit');
const logger = require('./utils/logger');
const app = require('./app');
const { initSocket, closeSocket } = require('./sockets/index');

const start = async () => {
  await connectDB();

  if (!isImageKitConfigured()) {
    logger.warn('ImageKit is not configured — image uploads will fail until IMAGEKIT_* env vars are set');
  }

  // Crons — skip in test environment
  let paymentTimeoutCron = null;
  let refundRetryCron = null;
  let lowStockDigestCron = null;
  if (!env.isTest) {
    paymentTimeoutCron = require('./jobs/paymentTimeout.cron');
    refundRetryCron = require('./jobs/refundRetry.cron');
    paymentTimeoutCron.start();
    refundRetryCron.start();
    lowStockDigestCron = require('./jobs/lowStockDigest.cron');
    lowStockDigestCron.start();
    // Non-fatal SMTP check (logs only; also logs the single "not configured" warning)
    require('./infrastructure/email/mailer').verifyConnection();
  }

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, prefix: env.URL_PREFIX },
      'OnlineMart backend started'
    );
  });

  initSocket(server);

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    closeSocket();
    if (paymentTimeoutCron) paymentTimeoutCron.stop();
    if (refundRetryCron) refundRetryCron.stop();
    if (lowStockDigestCron) lowStockDigestCron.stop();
    server.close(async () => {
      try {
        await disconnectDB();
        process.exit(0);
      } catch (err) {
        logger.error({ err: err.message }, 'Error during shutdown');
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err) => {
  logger.error({ err: err.message }, 'Failed to start server');
  process.exit(1);
});
