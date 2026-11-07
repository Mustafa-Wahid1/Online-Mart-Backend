'use strict';

const mongoose = require('mongoose');
const Payment = require('../../models/Payment.model');
const Order = require('../../models/Order.model');
const gateway = require('../../infrastructure/payment');
const gatewayMode = require('../../infrastructure/payment').mode;
const AppError = require('../../utils/AppError');
const { toString: moneyToString } = require('../../utils/money');
const { formatOrder } = require('../order/orderCreation.service');
const env = require('../../config/env');
const { onPaymentFailed, onProcessingError } = require('../notification.triggers');

const formatPayment = (p) => {
  const obj = p.toObject ? p.toObject() : { ...p };
  return {
    id: obj._id.toString(),
    orderId: obj.orderId.toString(),
    userId: obj.userId.toString(),
    amount: moneyToString(obj.amount),
    currency: obj.currency || 'USD',
    status: obj.status,
    gatewayRef: obj.gatewayRef,
    gateway: obj.gateway || gatewayMode,
    paidAt: obj.paidAt,
    refundedAt: obj.refundedAt,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    clientSecret: obj.metadata?.clientSecret || obj.gatewayRef || null,
    approveUrl: obj.metadata?.approveUrl || null,
  };
};

/**
 * Initiate payment for an order.
 * - Reuse existing PENDING payment if present
 * - Amount always from server (order.total)
 * - Only owner can initiate
 */
const initiate = async (userId, { orderId, returnUrl, cancelUrl }) => {
  if (!orderId) throw new AppError('orderId is required', 400);

  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);
  if (order.userId.toString() !== String(userId)) {
    throw new AppError('Order not found', 404);
  }

  if (order.status === 'CANCELLED' || order.status === 'REFUND_PENDING') {
    throw new AppError('Cannot pay for a cancelled order', 400);
  }
  if (order.paymentStatus === 'PAID') {
    throw new AppError('Order is already paid', 400);
  }
  if (order.status !== 'PENDING') {
    throw new AppError('Only PENDING orders can initiate payment', 400);
  }

  // Reuse existing pending payment
  let payment = await Payment.findOne({
    orderId: order._id,
    status: { $in: ['PENDING'] },
  });

  if (payment) {
    return formatPayment(payment);
  }

  const intent = await gateway.createIntent({
    amount: order.total,
    currency: 'USD',
    orderId: order._id,
    metadata: { returnUrl, cancelUrl },
  });

  payment = await Payment.create({
    orderId: order._id,
    userId: order.userId,
    amount: order.total,
    currency: 'USD',
    status: 'PENDING',
    gatewayRef: intent.gatewayRef,
    gateway: gatewayMode,
    metadata: {
      clientSecret: intent.clientSecret,
      approveUrl: intent.approveUrl || null,
    },
  });

  return formatPayment(payment);
};

/**
 * Capture payment after approval (frontend calls this).
 */
const capture = async (userId, paymentId, { gatewayOrderId } = {}) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new AppError('Payment not found', 404);

  if (payment.userId.toString() !== String(userId)) {
    throw new AppError('Payment not found', 404);
  }

  if (payment.status === 'PAID') {
    const order = await Order.findById(payment.orderId);
    return {
      payment: formatPayment(payment),
      order: order ? formatOrder(order) : null,
      message: 'Payment already completed',
    };
  }

  if (payment.status !== 'PENDING') {
    throw new AppError(`Cannot capture payment in status ${payment.status}`, 400);
  }

  const ref = gatewayOrderId || payment.gatewayRef;
  if (!ref) throw new AppError('Missing gateway reference', 400);

  // Capture on gateway
  let captureResult;
  try {
    captureResult = await gateway.capture(ref);
  } catch (err) {
    await onPaymentFailed(payment, err.message);
    await onProcessingError({
      scope: 'payment',
      entityId: String(payment.orderId),
      message: err.message,
    });
    throw err;
  }

  if (captureResult.status !== 'COMPLETED') {
    await onPaymentFailed(payment, `Capture status ${captureResult.status}`);
    throw new AppError(`Capture failed: ${captureResult.status}`, 400);
  }

  // Persist capture id for refunds
  payment.metadata = {
    ...(payment.metadata || {}),
    captureId: captureResult.captureId,
  };

  // Reuse webhook success path for consistency (stats, order status, etc.)
  const webhookService = require('./webhook.service');
  const event = {
    id: `cap_${Date.now()}`,
    type: 'payment.succeeded',
    data: {
      gatewayRef: payment.gatewayRef,
      paymentId: payment._id.toString(),
      orderId: payment.orderId.toString(),
      amount: payment.amount,
      captureId: captureResult.captureId,
    },
  };

  // Capture itself is the proof of payment.
  const result = await webhookService.handlePaymentSuccess(event.data, { skipSignature: true });

  return result;
};

/**
 * Mock-complete: only available when gateway is mock.
 */
const mockComplete = async (userId, paymentId) => {
  if (gatewayMode !== 'mock') {
    throw new AppError('Mock complete is only available with mock gateway', 400);
  }

  const payment = await Payment.findById(paymentId);
  if (!payment) throw new AppError('Payment not found', 404);

  if (payment.userId.toString() !== String(userId)) {
    throw new AppError('Payment not found', 404);
  }

  if (payment.status === 'PAID') {
    const order = await Order.findById(payment.orderId);
    return {
      payment: formatPayment(payment),
      order: order ? formatOrder(order) : null,
      message: 'Payment already completed',
    };
  }

  if (payment.status !== 'PENDING') {
    throw new AppError(`Cannot complete payment in status ${payment.status}`, 400);
  }

  const event = gateway.buildSucceededEvent({
    gatewayRef: payment.gatewayRef,
    amount: payment.amount,
    orderId: payment.orderId,
    paymentId: payment._id,
  });

  const signature = gateway.signEvent(event);
  const webhookService = require('./webhook.service');
  const result = await webhookService.handleMockWebhook(event, signature);

  return result;
};

/**
 * Best-effort cancel of gateway intent (unpaid orders).
 */
const cancelGatewayIntent = async (orderId) => {
  const payment = await Payment.findOne({
    orderId,
    status: 'PENDING',
  });
  if (!payment || !payment.gatewayRef) return null;

  try {
    await gateway.cancelIntent(payment.gatewayRef);
    payment.status = 'CANCELLED';
    await payment.save();
    return payment;
  } catch {
    return null;
  }
};

module.exports = {
  initiate,
  capture,
  mockComplete,
  cancelGatewayIntent,
  formatPayment,
};
