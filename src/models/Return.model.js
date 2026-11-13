'use strict';

const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, default: '' },
  },
  { _id: false }
);

const returnSchema = new mongoose.Schema(
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
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      index: true,
    },
    items: {
      type: [returnItemSchema],
      required: true,
      validate: [(v) => v.length > 0, 'At least one item is required'],
    },
    reason: {
      type: String,
      required: true,
      enum: [
        'DAMAGED',
        'WRONG_ITEM',
        'NOT_AS_DESCRIBED',
        'QUALITY_ISSUE',
        'CHANGED_MIND',
        'OTHER',
      ],
    },
    comments: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'],
      default: 'PENDING',
      index: true,
    },
    adminNotes: {
      type: String,
      default: '',
      maxlength: 2000,
    },
    /** Filled when the return is completed and the customer is refunded. */
    refundAmount: { type: Number, default: null, min: 0 },
    refundedAt: { type: Date, default: null },
    refundId: { type: String, default: null },
    restocked: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

returnSchema.index({ userId: 1, createdAt: -1 });
returnSchema.index({ orderId: 1, userId: 1 });

const ReturnRequest = mongoose.model('ReturnRequest', returnSchema);
module.exports = ReturnRequest;
