'use strict';

const cron = require('node-cron');
const Order = require('../models/Order.model');
const { cancelByTimeout } = require('../services/order/orderCancellation.service');
const logger = require('../utils/logger');
const { onPaymentReminder, onProcessingError } = require('../services/notification.triggers');

const BATCH_SIZE = 50;
const REMINDER_WINDOW_MS = 60 * 1000;

/**
 * Payment timeout cron — every minute.
 * Finds PENDING orders with paymentExpiresAt < now (max 50).
 * Cancels via cancelByTimeout (PAYMENT_TIMEOUT).
 * Silently skips conflicts / already-cancelled.
 */
const processExpiredPayments = async () => {
  const now = new Date();
  let processed = 0;
  let cancelled = 0;
  let skipped = 0;

  try {
    const expired = await Order.find({
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentExpiresAt: { $lte: now },
    })
      .sort({ paymentExpiresAt: 1 })
      .limit(BATCH_SIZE)
      .select('_id orderNumber paymentExpiresAt')
      .lean();

    if (expired.length === 0) return;

    logger.info({ count: expired.length }, 'Payment timeout: processing expired orders');

    for (const order of expired) {
      processed += 1;
      try {
        const result = await cancelByTimeout(order._id.toString());
        if (result && result.skipped) {
          skipped += 1;
        } else if (result && result.alreadyCancelled) {
          skipped += 1;
        } else {
          cancelled += 1;
          // Best-effort gateway cancel for unpaid
          try {
            const paymentService = require('../services/payment/payment.service');
            await paymentService.cancelGatewayIntent(order._id.toString());
          } catch (err) {
            logger.warn(
              { orderId: order._id.toString(), err: err.message },
              'Gateway cancel after timeout failed'
            );
          }
        }
      } catch (err) {
        // Skip 409-style / operational conflicts silently
        if (err.statusCode === 400 || err.statusCode === 404 || err.statusCode === 409) {
          skipped += 1;
          logger.warn(
            { orderId: order._id.toString(), err: err.message },
            'Payment timeout cancel skipped'
          );
        } else {
          logger.error(
            { orderId: order._id.toString(), err: err.message },
            'Payment timeout cancel failed'
          );
          await onProcessingError({
            scope: 'timeout',
            entityId: order._id.toString(),
            orderId: order.orderNumber,
            message: err.message,
          });
        }
      }
    }

    logger.info({ processed, cancelled, skipped }, 'Payment timeout batch complete');
  } catch (err) {
    logger.error({ err: err.message }, 'Payment timeout job failed');
  }
};

/**
 * Payment reminder — finds unpaid orders whose payment window ends within 1 minute.
 * Query-based (survives restarts); sent once per order via the notification dedupe key.
 */
const sendPaymentReminders = async () => {
  try {
    const now = new Date();
    const soon = await Order.find({
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentExpiresAt: { $gt: now, $lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
    })
      .sort({ paymentExpiresAt: 1 })
      .limit(BATCH_SIZE)
      .select('_id orderNumber userId')
      .lean();

    for (const order of soon) {
      await onPaymentReminder(order);
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Payment reminder job failed');
  }
};

let task = null;
let reminderTask = null;

const start = () => {
  if (task) return task;
  // Every minute
  task = cron.schedule('* * * * *', () => {
    processExpiredPayments().catch((err) => {
      logger.error({ err: err.message }, 'Unhandled payment timeout error');
    });
  });
  logger.info('Payment timeout cron started (every minute)');
  // Reminder check — every 10 seconds so "1 minute left" is accurate
  reminderTask = cron.schedule('*/10 * * * * *', () => {
    sendPaymentReminders().catch((err) => {
      logger.error({ err: err.message }, 'Unhandled payment reminder error');
    });
  });
  return task;
};

const stop = () => {
  if (task) {
    task.stop();
    task = null;
    logger.info('Payment timeout cron stopped');
  }
  if (reminderTask) {
    reminderTask.stop();
    reminderTask = null;
  }
};

module.exports = {
  start,
  stop,
  processExpiredPayments,
  sendPaymentReminders,
};
