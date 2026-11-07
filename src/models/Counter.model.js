'use strict';

const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.getNextSequence = async function (name, session = null) {
  const opts = { new: true, upsert: true };
  if (session) opts.session = session;
  const counter = await this.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    opts
  );
  return counter.seq;
};

const Counter = mongoose.model('Counter', counterSchema);
module.exports = Counter;
