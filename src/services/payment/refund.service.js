'use strict';

const mongoose = require('mongoose');
const Payment = require('../../models/Payment.model');
const Order = require('../../models/Order.model');
const User = require('../../models/User.model');
const gateway = require('../../infrastructure/payment');
const AppError = require('../../utils/AppError');
const { formatPayment } = require('./payment.service');
const { formatOrder } = require('../order/orderCreation.service');
const logger = require('../../utils/logger');
const { subtract } = require('../../utils/money');
const { onRefunded, onProcessingError } = require('../notification.triggers');

/**
 * Refund an order's payment.
 * - PAID payment → REFUNDED
 * - Order REFUND_PENDING → CANCELLED
 * - Restore totalSpent / totalOrders on user
 * - Idempotent if already refunded
 */
const refundOrder = async (orderId, { reason = 'requested_by_customer' } = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.findById(orderId).session(session);
    if (!order) throw new AppError('Order not found', 404);

    const payment = await Payment.findOne({
      orderId: order._id,
      status: { $in: ['PAID', 'REFUNDED'] },
    }).session(session);

    if (!payment) {
      // No paid payment — just ensure order is CANCELLED if REFUND_PENDING
      if (order.status === 'REFUND_PENDING') {
        order.status = 'CANCELLED';
        await order.save({ session });
      }
      await session.commitTransaction();
      return {
        order: formatOrder(order),
        payment: null,
        message: 'No paid payment to refund',
      };
    }

    if (payment.status === 'REFUNDED') {
      if (order.status === 'REFUND_PENDING') {
        order.status = 'CANCELLED';
        order.paymentStatus = 'REFUNDED';
        await order.save({ session });
      }
      await session.commitTransaction();
      return {
        order: formatOrder(order),
        payment: formatPayment(payment),
        message: 'Already refunded',
      };
    }

    // Call gateway refund (outside strict failure — but inside try for logging)
    let gatewayResult;
    try {
      gatewayResult = await gateway.refund({
        gatewayRef: payment.gatewayRef,
        amount: payment.amount,
        reason,
      });
    } catch (err) {
      logger.error(
        { orderId, gatewayRef: payment.gatewayRef, err: err.message },
        'Gateway refund failed'
      );
      await onProcessingError({
        scope: 'refund',
        entityId: String(orderId),
        orderId: order.orderNumber,
        message: err.message,
      });
      throw new AppError('Gateway refund failed', 502);
    }

    payment.status = 'REFUNDED';
    payment.refundedAt = new Date();
    payment.metadata = {
      ...(payment.metadata || {}),
      refundId: gatewayResult.refundId,
      refundReason: reason,
    };
    await payment.save({ session });

    order.paymentStatus = 'REFUNDED';
    if (order.status === 'REFUND_PENDING' || order.status === 'CONFIRMED' || order.status === 'PENDING') {
      order.status = 'CANCELLED';
      if (!order.cancelledAt) {
        order.cancelledAt = new Date();
        order.cancelledBy = order.cancelledBy || 'SYSTEM';
        order.cancelReason = order.cancelReason || reason;
      }
    }
    await order.save({ session });

    // Restore user stats
    const user = await User.findById(order.userId).session(session);
    if (user) {
      user.totalOrders = Math.max(0, (user.totalOrders || 0) - 1);
      user.totalSpent = Math.max(0, Number(subtract(user.totalSpent || 0, order.total)));
      await user.save({ session });
    }

    await session.commitTransaction();

    await onRefunded(order);

    return {
      order: formatOrder(order),
      payment: formatPayment(payment),
      message: 'Refund succeeded',
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

module.exports = {
  refundOrder,
};
