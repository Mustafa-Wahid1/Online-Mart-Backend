'use strict';

const cron = require('node-cron');
const Inventory = require('../models/Inventory.model');
const Product = require('../models/Product.model');
const logger = require('../utils/logger');
const { getTimezone } = require('../infrastructure/email/mailer');
const { dayKey } = require('../infrastructure/email/templates/format');
const { adminLowStockDigest } = require('../infrastructure/email/email.events');

/**
 * Daily low-stock digest — 09:00 in MAIL_TIMEZONE.
 * One email listing every active product that is LOW_STOCK or OUT_OF_STOCK.
 * Sends nothing when there is nothing to report; the EmailLog dedupe key
 * (one per calendar day) guarantees it is never sent twice on the same day.
 */
const sendLowStockDigest = async () => {
  try {
    const inventories = await Inventory.find({ status: { $in: ['LOW_STOCK', 'OUT_OF_STOCK'] } })
      .select('productId qtyOnHand lowStockThreshold status')
      .lean();
    if (inventories.length === 0) return;

    const products = await Product.find({
      _id: { $in: inventories.map((i) => i.productId) },
      isActive: true,
    })
      .select('name')
      .lean();
    const names = new Map(products.map((p) => [String(p._id), p.name]));

    const items = inventories
      .filter((i) => names.has(String(i.productId)))
      .map((i) => ({
        name: names.get(String(i.productId)),
        qtyOnHand: i.qtyOnHand,
        lowStockThreshold: i.lowStockThreshold,
        status: i.status,
      }))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'OUT_OF_STOCK' ? -1 : 1;
        return a.qtyOnHand - b.qtyOnHand || a.name.localeCompare(b.name);
      });

    const result = await adminLowStockDigest(items, dayKey());
    logger.info({ products: items.length, status: result && result.status }, 'Low-stock digest processed');
  } catch (err) {
    logger.error({ err: err.message }, 'Low-stock digest job failed');
  }
};

let task = null;

const start = () => {
  if (task) return task;
  // Every day at 09:00 in MAIL_TIMEZONE
  task = cron.schedule(
    '0 9 * * *',
    () => {
      sendLowStockDigest().catch((err) => {
        logger.error({ err: err.message }, 'Unhandled low-stock digest error');
      });
    },
    { timezone: getTimezone() }
  );
  logger.info({ timezone: getTimezone() }, 'Low-stock digest cron started (daily at 09:00)');
  return task;
};

const stop = () => {
  if (task) {
    task.stop();
    task = null;
    logger.info('Low-stock digest cron stopped');
  }
};

module.exports = { start, stop, sendLowStockDigest };
