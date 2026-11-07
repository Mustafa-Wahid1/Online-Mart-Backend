'use strict';

const Order = require('../../models/Order.model');
const AppError = require('../../utils/AppError');
const { formatOrder } = require('./orderCreation.service');
const { onOrderStatus } = require('../notification.triggers');

/**
 * Allowed status transitions (exact map from prompt):
 * PENDING → CONFIRMED (only via payment webhook)
 * CONFIRMED → PROCESSING
 * PROCESSING → READY_FOR_PICKUP (PICKUP only) / READY_FOR_DELIVERY (DELIVERY only)
 * READY_* → DELIVERED
 * Paid cancel → REFUND_PENDING → CANCELLED (handled in cancellation)
 */
const ALLOWED_TRANSITIONS = {
  CONFIRMED: ['PROCESSING'],
  PROCESSING: ['READY_FOR_PICKUP', 'READY_FOR_DELIVERY'],
  READY_FOR_PICKUP: ['DELIVERED'],
  READY_FOR_DELIVERY: ['DELIVERED'],
};

/**
 * Admin updates order status.
 * PENDING cannot be set here (payment webhook only).
 * CANCELLED / REFUND_PENDING use cancel endpoint.
 */
const updateStatus = async (orderId, newStatus) => {
  if (!newStatus) throw new AppError('status is required', 400);

  if (newStatus === 'CANCELLED' || newStatus === 'REFUND_PENDING') {
    throw new AppError('Use the /cancel endpoint', 400);
  }
  if (newStatus === 'CONFIRMED' || newStatus === 'PENDING') {
    throw new AppError('Cannot set status to PENDING or CONFIRMED via this endpoint', 400);
  }

  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);

  const allowed = ALLOWED_TRANSITIONS[order.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new AppError(
      `Invalid status transition from ${order.status} to ${newStatus}`,
      400
    );
  }

  // Delivery-type constraints
  if (newStatus === 'READY_FOR_PICKUP' && order.deliveryType !== 'PICKUP') {
    throw new AppError('READY_FOR_PICKUP is only valid for PICKUP orders', 400);
  }
  if (newStatus === 'READY_FOR_DELIVERY' && order.deliveryType !== 'DELIVERY') {
    throw new AppError('READY_FOR_DELIVERY is only valid for DELIVERY orders', 400);
  }

  order.status = newStatus;
  await order.save();
  await onOrderStatus(order, newStatus);
  return await formatOrder(order);
};

/**
 * Internal: confirm order after successful payment (webhook).
 */
const confirmAfterPayment = async (orderId, session = null) => {
  const opts = session ? { session } : {};
  const order = await Order.findById(orderId, null, opts);
  if (!order) throw new AppError('Order not found', 404);

  if (order.status === 'PENDING') {
    order.status = 'CONFIRMED';
    order.paymentStatus = 'PAID';
    await order.save(opts);
  }
  // If already CONFIRMED/PAID — idempotent no-op
  return order;
};

module.exports = {
  updateStatus,
  confirmAfterPayment,
  ALLOWED_TRANSITIONS,
};