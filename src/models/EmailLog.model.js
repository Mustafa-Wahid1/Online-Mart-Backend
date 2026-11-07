'use strict';

const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, trim: true, lowercase: true },
    type: { type: String, required: true, trim: true },
    dedupeKey: { type: String },
    // PENDING = claimed, send in progress (internal state used to guarantee at-most-once).
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED', 'SKIPPED'], required: true },
    messageId: { type: String, default: null },
    error: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

emailLogSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
emailLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('EmailLog', emailLogSchema);
