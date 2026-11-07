'use strict';

const mongoose = require('mongoose');
const { toString: moneyToString } = require('../utils/money');

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      default: 'GBP',
    },
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'],
      default: 'PENDING',
    },
    gatewayRef: {
      type: String,
      unique: true,
      sparse: true,
    },
    gateway: {
      type: String,
      default: 'mock',
    },
    paidAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        if (ret.amount !== undefined) ret.amount = moneyToString(ret.amount);
        delete ret.__v;
        return ret;
      },
    },
  }
);

paymentSchema.index({ orderId: 1, status: 1 });

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
