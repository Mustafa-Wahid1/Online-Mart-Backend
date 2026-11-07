'use strict';

const mongoose = require('mongoose');
const { toString: moneyToString } = require('../utils/money');

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, default: '' },
  },
  { _id: false }
);

const orderAddressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true },
    line2: { type: String, default: '' },
    city: { type: String, required: true },
    postcode: { type: String, required: true },
    country: { type: String, default: 'GB' },
    label: { type: String, default: '' },
    phone: { type: String, default: '' },
    houseNo: { type: String, default: '' },
    landmark: { type: String, default: '' },
    /** Snapshot of map pin so admin / rider can open exact location */
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    formattedAddress: { type: String, default: '' },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(v) => v.length > 0, 'Order must have at least one item'],
    },
    deliveryType: {
      type: String,
      enum: ['DELIVERY', 'PICKUP'],
      required: true,
    },
    address: {
      type: orderAddressSchema,
      default: null,
    },
    pickupScheduledAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: [
        'PENDING',
        'CONFIRMED',
        'PROCESSING',
        'READY_FOR_PICKUP',
        'READY_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
        'REFUND_PENDING',
      ],
      default: 'PENDING',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PAID', 'REFUNDED'],
      default: 'UNPAID',
    },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentExpiresAt: {
      type: Date,
      default: null,
    },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
    cancelledBy: {
      type: String,
      enum: ['CUSTOMER', 'ADMIN', 'SYSTEM', 'PAYMENT_TIMEOUT', null],
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        if (ret.subtotal !== undefined) ret.subtotal = moneyToString(ret.subtotal);
        if (ret.shippingFee !== undefined) ret.shippingFee = moneyToString(ret.shippingFee);
        if (ret.total !== undefined) ret.total = moneyToString(ret.total);
        if (ret.items) {
          ret.items = ret.items.map((i) => ({
            ...i,
            unitPrice: moneyToString(i.unitPrice),
            lineTotal: moneyToString(i.lineTotal),
          }));
        }
        delete ret.__v;
        return ret;
      },
    },
  }
);

orderSchema.index({ status: 1, paymentExpiresAt: 1 });
orderSchema.index({ userId: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;