'use strict';

const mongoose = require('mongoose');

const inventoryTransactionSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'RECEIVED',
        'ADJUSTMENT_DAMAGE',
        'ADJUSTMENT_RETURN_TO_SUPPLIER',
        'ADJUSTMENT_RESTOCK',
        'ADJUSTMENT_OTHER',
        'CONSUMED',
        'RELEASED',
      ],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    qtyBefore: {
      type: Number,
      required: true,
    },
    qtyAfter: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    referenceType: {
      type: String,
      enum: ['ORDER', 'MANUAL', 'SYSTEM', null],
      default: null,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

inventoryTransactionSchema.index({ productId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ referenceType: 1, referenceId: 1 });

const InventoryTransaction = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
module.exports = InventoryTransaction;
