'use strict';

const mongoose = require('mongoose');
const Order = require('../../models/Order.model');
const User = require('../../models/User.model');
const inventoryService = require('../inventory.service');
const AppError = require('../../utils/AppError');
const { formatOrder } = require('./orderCreation.service');
const logger = require('../../utils/logger');
const { flushStockChanges, onOrderCancelled, onProcessingError } = require('../notification.triggers');

/**
 * Shared cancellation used by customer, admin, and payment-timeout cron.
 *
 * Rules:
 * - Customer: only PENDING / CONFIRMED. Already cancelled → 200 "Order is already cancelled."
 * - Admin: broader. DELIVERED → 400.
 * - Unpaid → CANCELLED. Paid → REFUND_PENDING (+ decrement totalOrders later on refund).
 * - Restore stock (CONSUMED → RELEASED).
 * - After commit: best-effort gateway cancel (unpaid) or RefundService (paid) — caller handles.
 */
const cancelInTx = async ({
  orderId,
  userId = null,
  role = 'CUSTOMER',
  reason = null,
  cancelledBy = 'CUSTOMER',
  skipOwnershipCheck = false,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      throw new AppError('Order not found', 404);
    }

    // Ownership for customer
    if (!skipOwnershipCheck && role === 'CUSTOMER') {
      if (order.userId.toString() !== String(userId)) {
        throw new AppError('Order not found', 404);
      }
    }

    // Already cancelled / refund pending
    if (order.status === 'CANCELLED' || order.status === 'REFUND_PENDING') {
      if (role === 'CUSTOMER') {
        await session.abortTransaction();
        session.endSession();
        return {
          alreadyCancelled: true,
          order: await formatOrder(order),
          message: 'Order is already cancelled.',
        };
      }
      // Admin on already cancelled — still return success-ish
      await session.abortTransaction();
      session.endSession();
      return {
        alreadyCancelled: true,
        order: await formatOrder(order),
        message: 'Order is already cancelled.',
      };
    }

    // Customer allowed statuses
    if (role === 'CUSTOMER') {
      if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
        throw new AppError(
          `Cannot cancel order in status ${order.status}`,
          400
        );
      }
    }

    // Admin: cannot cancel delivered
    if (role === 'ADMIN' || role === 'SYSTEM') {
      if (order.status === 'DELIVERED') {
        throw new AppError('Cannot cancel a delivered order', 400);
      }
    }

    const wasPaid = order.paymentStatus === 'PAID';

    if (wasPaid) {
      order.status = 'REFUND_PENDING';
    } else {
      order.status = 'CANCELLED';
      order.paymentStatus = order.paymentStatus === 'UNPAID' ? 'UNPAID' : order.paymentStatus;
    }

    order.cancelledAt = new Date();
    order.cancelReason = reason || (cancelledBy === 'PAYMENT_TIMEOUT' ? 'Payment timeout' : 'Cancelled');
    order.cancelledBy = cancelledBy;

    await order.save({ session });

    // Restore stock
    await inventoryService.releaseForOrderInTx({
      orderId: order._id,
      session,
    });

    // If was paid and moving to REFUND_PENDING, totalOrders decrement happens on final refund.
    // For unpaid cancel: if it was never confirmed, totalOrders was never incremented.

    await session.commitTransaction();
    session.endSession();

    await flushStockChanges(session);
    await onOrderCancelled({ order, wasPaid, cancelledBy });

    return {
      alreadyCancelled: false,
      order: await formatOrder(order),
      wasPaid,
      needsRefund: wasPaid,
      needsGatewayCancel: !wasPaid,
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

/**
 * Best-effort post-commit: gateway cancel (unpaid) or refund (paid).
 */
const runPostCancelHooks = async (result) => {
  if (!result || result.alreadyCancelled) return;
  try {
    if (result.needsRefund) {
      const refundService = require('../payment/refund.service');
      await refundService.refundOrder(result.order.id, {
        reason: result.order.cancelReason || 'Order cancelled',
      });
    } else if (result.needsGatewayCancel) {
      const paymentService = require('../payment/payment.service');
      await paymentService.cancelGatewayIntent(result.order.id);
    }
  } catch (err) {
    logger.error(
      { orderId: result.order?.id, err: err.message },
      'Post-cancel payment hook failed'
    );
    await onProcessingError({
      scope: result.needsRefund ? 'refund' : 'payment-cancel',
      entityId: result.order?.id,
      orderId: result.order?.orderNumber,
      message: err.message,
    });
  }
};

/**
 * Customer cancel endpoint handler.
 */
const cancelByCustomer = async (userId, orderId, reason = null) => {
  const result = await cancelInTx({
    orderId,
    userId,
    role: 'CUSTOMER',
    reason,
    cancelledBy: 'CUSTOMER',
  });

  if (result.alreadyCancelled) {
    return { message: result.message, order: result.order, statusCode: 200 };
  }

  await runPostCancelHooks(result);
  // Re-fetch order after possible refund
  const Order = require('../../models/Order.model');
  const { formatOrder } = require('./orderCreation.service');
  const fresh = await Order.findById(orderId);
  return {
    order: fresh ? await formatOrder(fresh) : result.order,
    wasPaid: result.wasPaid,
    needsRefund: result.needsRefund,
  };
};

/**
 * Admin cancel.
 */
const cancelByAdmin = async (orderId, reason = null) => {
  const result = await cancelInTx({
    orderId,
    role: 'ADMIN',
    reason,
    cancelledBy: 'ADMIN',
    skipOwnershipCheck: true,
  });

  if (result.alreadyCancelled) {
    return { message: result.message, order: result.order, statusCode: 200 };
  }

  await runPostCancelHooks(result);
  const Order = require('../../models/Order.model');
  const { formatOrder } = require('./orderCreation.service');
  const fresh = await Order.findById(orderId);
  return {
    order: fresh ? await formatOrder(fresh) : result.order,
    wasPaid: result.wasPaid,
    needsRefund: result.needsRefund,
  };
};

/**
 * System / payment timeout cancel.
 * Silently skip if already cancelled (409-style → no throw).
 */
const cancelByTimeout = async (orderId) => {
  try {
    const result = await cancelInTx({
      orderId,
      role: 'SYSTEM',
      reason: 'Payment timeout',
      cancelledBy: 'PAYMENT_TIMEOUT',
      skipOwnershipCheck: true,
    });
    return result;
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 404) {
      logger.warn({ orderId, err: err.message }, 'Timeout cancel skipped');
      return { skipped: true };
    }
    throw err;
  }
};

module.exports = {
  cancelInTx,
  cancelByCustomer,
  cancelByAdmin,
  cancelByTimeout,
};