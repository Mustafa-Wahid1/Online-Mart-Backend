'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 255,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['CUSTOMER', 'ADMIN'],
      default: 'CUSTOMER',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    totalOrders: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
    // No default on purpose: existing users have no value and are treated as verified.
    // Only accounts created by the sign-up flow are written with false.
    emailVerified: {
      type: Boolean,
    },
    passwordChangedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index(
  { role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'ADMIN' },
  }
);

const User = mongoose.model('User', userSchema);

module.exports = User;
