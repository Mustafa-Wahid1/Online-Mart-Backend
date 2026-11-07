'use strict';

const cron = require('node-cron');
const Order = require('../models/Order.model');
const refundService = require('../services/payment/refund.service');
const logger = require('../utils/logger');

const BATCH_SIZE = 30;

/**
 * Refund retry cron — every 5 minutes.
 * Finds REFUND_PENDING orders and attempts RefundService.refundOrder.
 */
const processPendingRefunds = async () => {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const pending = await Order.find({
      status: 'REFUND_PENDING',
    })
      .sort({ cancelledAt: 1 })
      .limit(BATCH_SIZE)
      .select('_id orderNumber')
      .lean();

    if (pending.length === 0) return;

    logger.info({ count: pending.length }, 'Refund retry: processing pending refunds');

    for (const order of pending) {
      processed += 1;
      try {
        await refundService.refundOrder(order._id.toString(), {
          reason: 'Automated refund retry',
        });
        succeeded += 1;
      } catch (err) {
        failed += 1;
        logger.error(
          { orderId: order._id.toString(), err: err.message },
          'Refund retry failed'
        );
      }
    }

    logger.info({ processed, succeeded, failed }, 'Refund retry batch complete');
  } catch (err) {
    logger.error({ err: err.message }, 'Refund retry job failed');
  }
};

let task = null;

const start = () => {
  if (task) return task;
  // Every 5 minutes
  task = cron.schedule('*/5 * * * *', () => {
    processPendingRefunds().catch((err) => {
      logger.error({ err: err.message }, 'Unhandled refund retry error');
    });
  });
  logger.info('Refund retry cron started (every 5 minutes)');
  return task;
};

const stop = () => {
  if (task) {
    task.stop();
    task = null;
    logger.info('Refund retry cron stopped');
  }
};

module.exports = {
  start,
  stop,
  processPendingRefunds,
};
