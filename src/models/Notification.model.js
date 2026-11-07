'use strict';

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readAt: {
      type: Date,
      default: null,
    },
    dedupeKey: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
