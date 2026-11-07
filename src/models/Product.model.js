'use strict';

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    price: {
      type: Number,
      required: true,
      min: 0.01,
      validate: {
        validator(v) {
          return Math.round(v * 100) / 100 === v || Math.abs(v - Math.round(v * 100) / 100) < 1e-9;
        },
        message: 'Price must have at most 2 decimal places',
      },
    },
    unit: {
      type: String,
      default: 'each',
      trim: true,
      maxlength: 30,
    },
    minimumOrderQuantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    maximumOrderQuantity: {
      type: Number,
      default: 99,
      min: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        if (ret.price !== undefined) ret.price = Number(ret.price).toFixed(2);
        delete ret.__v;
        return ret;
      },
    },
  }
);

productSchema.index({ name: 1, categoryId: 1 }, { unique: true });
productSchema.index({ isActive: 1, categoryId: 1 });

productSchema.pre('validate', function (next) {
  if (this.maximumOrderQuantity < this.minimumOrderQuantity) {
    this.invalidate(
      'maximumOrderQuantity',
      'maximumOrderQuantity must be >= minimumOrderQuantity'
    );
  }
  next();
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
