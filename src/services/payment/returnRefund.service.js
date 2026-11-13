'use strict';

const mongoose = require('mongoose');
const ReturnRequest = require('../../models/Return.model');
const Order = require('../../models/Order.model');
const Payment = require('../../models/Payment.model');
const User = require('../../models/User.model');
const gateway = require('../../infrastructure/payment');
const inventoryService = require('../inventory.service');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const { addEvent } = require('../../utils/orderEvents');
const { toMinor, fromMinor } = require('../../utils/money');
const { flushStockChanges, onProcessingError } = require('../notification.triggers');

/** Items returned for these reasons are not put back on the shelf (not resellable). */
const NO_RESTOCK_REASONS = ['DAMAGED', 'QUALITY_ISSUE'];

/**
 * Complete an APPROVED return in one transaction:
 *  - refund the customer through the payment gateway
 *      (whole order returned -> order total, otherwise the value of the returned items)
 *  - payment -> REFUNDED and order.paymentStatus -> REFUNDED only when everything is refunded
 *  - reduce the customer's totalSpent (and totalOrders when fully refunded)
 *  - restock resellable items and write inventory ledger entries
 *  - add a line to the order timeline
 *  - mark the return COMPLETED with refund details (idempotent: a return refunds only once)
 *
 * If the gateway fails, nothing is changed and the return stays APPROVED.
 */
const completeReturn = async (returnId, adminNotes) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const ret = await ReturnRequest.findById(returnId).session(session);
    if (!ret) throw new AppError('Return not found', 404, 'NOT_FOUND');

    if (ret.status === 'COMPLETED' || ret.refundedAt) {
      throw new AppError('This return is already completed', 400, 'RETURN_ALREADY_COMPLETED');
    }
    if (ret.status !== 'APPROVED') {
      throw new AppError('Approve the return before completing it', 400, 'RETURN_NOT_APPROVED');
    }

    const order = await Order.findById(ret.orderId).session(session);
    if (!order) throw new AppError('Order not found', 404);

    const payment = await Payment.findOne({ orderId: order._id, status: 'PAID' }).session(session);

    // ---- how much to refund ----
    const itemsMinor = ret.items.reduce((sum, i) => sum + toMinor(i.unitPrice) * i.quantity, 0);
    const allReturned = order.items.every((oi) =>
      ret.items.some((ri) => String(ri.productId) === String(oi.productId) && ri.quantity >= oi.quantity)
    );
    let refundMinor = allReturned ? toMinor(order.total) : itemsMinor;
    if (payment) refundMinor = Math.min(refundMinor, toMinor(payment.amount));
    if (!payment) refundMinor = 0; // nothing was paid online, so nothing to send back

    let refundId = null;
    let fullRefund = false;

    if (payment && refundMinor > 0) {
      let gatewayResult;
      try {
        gatewayResult = await gateway.refund({
          gatewayRef: payment.gatewayRef,
          amount: Number(fromMinor(refundMinor)),
          reason: 'customer_return',
        });
      } catch (err) {
        logger.error(
          { returnId: String(ret._id), orderId: String(order._id), err: err.message },
          'Gateway refund for return failed'
        );
        await onProcessingError({
          scope: 'refund',
          entityId: String(ret._id),
          orderId: order.orderNumber,
          message: `Return refund failed: ${err.message}`,
        });
        throw new AppError('Refund failed at the payment gateway. The return was not completed.', 502);
      }
      refundId = gatewayResult.refundId || null;

      fullRefund = refundMinor >= toMinor(payment.amount);
      payment.metadata = {
        ...(payment.metadata || {}),
        returnRefunds: [
          ...((payment.metadata && payment.metadata.returnRefunds) || []),
          { returnId: String(ret._id), amount: Number(fromMinor(refundMinor)), refundId, at: new Date() },
        ],
      };
      if (fullRefund) {
        payment.status = 'REFUNDED';
        payment.refundedAt = new Date();
        order.paymentStatus = 'REFUNDED';
      }
      await payment.save({ session });

      // Customer stats
      const user = await User.findById(order.userId).session(session);
      if (user) {
        const spent = toMinor(user.totalSpent || 0) - refundMinor;
        user.totalSpent = Math.max(0, Number(fromMinor(Math.max(0, spent))));
        if (fullRefund) user.totalOrders = Math.max(0, (user.totalOrders || 0) - 1);
        await user.save({ session });
      }
    }

    // ---- restock resellable items ----
    let restocked = false;
    if (!NO_RESTOCK_REASONS.includes(ret.reason)) {
      for (const item of ret.items) {
        const inv = await inventoryService.restockInTx({
          productId: item.productId,
          quantity: item.quantity,
          orderId: order._id,
          session,
          reason: `Customer return (${ret.reason})`,
        });
        if (inv) restocked = true;
      }
    }

    // ---- order timeline ----
    addEvent(
      order,
      refundMinor > 0
        ? `Return completed — refund of $${fromMinor(refundMinor)} issued${fullRefund ? '' : ' (partial)'}`
        : 'Return completed'
    );
    await order.save({ session });

    // ---- the return itself ----
    ret.status = 'COMPLETED';
    if (adminNotes !== undefined) ret.adminNotes = String(adminNotes || '').trim();
    ret.refundAmount = Number(fromMinor(refundMinor));
    ret.refundedAt = new Date();
    ret.refundId = refundId;
    ret.restocked = restocked;
    await ret.save({ session });

    await session.commitTransaction();
    await flushStockChanges(session);
    return ret;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

module.exports = { completeReturn, NO_RESTOCK_REASONS };
