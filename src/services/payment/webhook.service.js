'use strict';

const mongoose = require('mongoose');
const Payment = require('../../models/Payment.model');
const Order = require('../../models/Order.model');
const User = require('../../models/User.model');
const gateway = require('../../infrastructure/payment');
const { confirmAfterPayment } = require('../order/orderStatus.service');
const { formatOrder } = require('../order/orderCreation.service');
const { formatPayment } = require('./payment.service');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const { add } = require('../../utils/money');
const { onPaymentReceived, onProcessingError } = require('../notification.triggers');

/**
 * Core success path used by mock webhook and mock-complete.
 * Marks payment PAID, confirms order, updates user stats.
 * Idempotent if already paid.
 */
const handlePaymentSuccess = async (data, { skipSignature = false } = {}) => {
  const gatewayRef = data.gatewayRef || data.gateway_ref;
  const paymentId = data.paymentId || data.payment_id;

  if (!gatewayRef && !paymentId) {
    throw new AppError('gatewayRef or paymentId is required', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let payment = null;

    if (paymentId) {
      payment = await Payment.findById(paymentId).session(session);
    }
    if (!payment && gatewayRef) {
      payment = await Payment.findOne({ gatewayRef }).session(session);
    }

    if (!payment) {
      throw new AppError('Payment not found for webhook', 404);
    }

    // Already paid — idempotent
    if (payment.status === 'PAID') {
      const order = await Order.findById(payment.orderId).session(session);
      await session.commitTransaction();
      return {
        payment: formatPayment(payment),
        order: order ? await formatOrder(order) : null,
        message: 'Payment already completed',
      };
    }

    if (payment.status !== 'PENDING') {
      throw new AppError(`Cannot complete payment in status ${payment.status}`, 400);
    }

    // Optional amount check
    if (data.amount != null && Number(data.amount) !== Number(payment.amount)) {
      logger.warn(
        { expected: payment.amount, received: data.amount, gatewayRef: payment.gatewayRef },
        'Webhook amount mismatch'
      );
    }

    payment.status = 'PAID';
    payment.paidAt = new Date();
    if (data.captureId) {
      payment.metadata = {
        ...(payment.metadata || {}),
        captureId: data.captureId,
      };
    }
    await payment.save({ session });

    const order = await confirmAfterPayment(payment.orderId, session);

    // Update user lifetime stats (only once, when first paid)
    const user = await User.findById(payment.userId).session(session);
    if (user && order) {
      user.totalOrders = (user.totalOrders || 0) + 1;
      user.totalSpent = Number(add(user.totalSpent || 0, order.total));
      await user.save({ session });
    }

    await session.commitTransaction();

    await onPaymentReceived(payment, order);

    return {
      payment: formatPayment(payment),
      order: order ? await formatOrder(order) : null,
      message: 'Payment succeeded',
    };
  } catch (err) {
    await session.abortTransaction();
    if (!err.isOperational) {
      await onProcessingError({
        scope: 'payment',
        entityId: String(data.orderId || data.paymentId || gatewayRef || ''),
        message: err.message,
      });
    }
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Mock webhook handler.
 * Expects signed event; verifies with mock gateway.
 */
const handleMockWebhook = async (event, signature) => {
  if (!event || typeof event !== 'object') {
    throw new AppError('Invalid webhook event', 400);
  }

  const type = event.type || event.event_type;
  if (type !== 'payment.succeeded') {
    throw new AppError(`Unsupported mock event type: ${type || 'unknown'}`, 400);
  }

  if (!gateway.verifyEvent(event, signature)) {
    throw new AppError('Invalid webhook signature', 401);
  }

  const data = event.data || {};
  return handlePaymentSuccess(data);
};

module.exports = {
  handlePaymentSuccess,
  handleMockWebhook,
};
