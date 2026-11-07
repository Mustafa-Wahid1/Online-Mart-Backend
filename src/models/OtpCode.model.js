'use strict';

const mongoose = require('mongoose');

const otpCodeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: ['VERIFY_EMAIL', 'RESET_PASSWORD'], required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    lastSentAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    // Hourly send cap bookkeeping (survives code replacement).
    sendCount: { type: Number, default: 1, min: 1 },
    sendWindowStart: { type: Date, required: true },
    // TTL: the row is kept until both the code and the hourly window are over.
    purgeAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Only ONE row per (user, purpose): issuing a new code replaces the old one.
otpCodeSchema.index({ userId: 1, purpose: 1 }, { unique: true });
otpCodeSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OtpCode', otpCodeSchema);
