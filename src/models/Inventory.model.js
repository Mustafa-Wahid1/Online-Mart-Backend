'use strict';

const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      unique: true,
    },
    qtyOnHand: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator(v) {
          return Number.isInteger(v) && v >= 0;
        },
        message: 'qtyOnHand must be a non-negative integer',
      },
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: 0,
    },
    status: {
      type: String,
      enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'],
      default: 'OUT_OF_STOCK',
    },
  },
  { timestamps: true }
);

inventorySchema.methods.recalculateStatus = function () {
  if (this.qtyOnHand <= 0) {
    this.status = 'OUT_OF_STOCK';
  } else if (this.qtyOnHand <= this.lowStockThreshold) {
    this.status = 'LOW_STOCK';
  } else {
    this.status = 'IN_STOCK';
  }
  return this.status;
};

const Inventory = mongoose.model('Inventory', inventorySchema);
module.exports = Inventory;
