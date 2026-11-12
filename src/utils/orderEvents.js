'use strict';

/**
 * Order timeline helpers.
 * addEvent() only mutates the document — caller is responsible for order.save().
 */
const STATUS_TEXT = {
  PENDING: 'Order placed — waiting for payment',
  CONFIRMED: 'Payment received — order confirmed',
  PROCESSING: 'Order is being processed',
  READY_FOR_PICKUP: 'Order is ready for pickup',
  READY_FOR_DELIVERY: 'Order is ready for delivery',
  DELIVERED: 'Order delivered',
  CANCELLED: 'Order cancelled',
  REFUND_PENDING: 'Order cancelled — refund in progress',
};

const addEvent = (order, text, at = new Date()) => {
  if (!order || !text) return;
  if (!Array.isArray(order.events)) order.events = [];
  order.events.push({ at, text });
};

module.exports = { addEvent, STATUS_TEXT };
