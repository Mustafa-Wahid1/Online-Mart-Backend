'use strict';

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User.model');
const Address = require('../models/Address.model');
const Cart = require('../models/Cart.model');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { onProfileUpdated } = require('./notification.triggers');

const getStats = async (userId) => {
  const user = await User.findById(userId).select('totalOrders totalSpent');
  if (!user) throw new AppError('User not found', 404);
  return {
    totalOrders: user.totalOrders,
    totalSpent: Number(user.totalSpent).toFixed(2),
  };
};

const updateMe = async (userId, { name, phone }) => {
  const user = await User.findById(userId);
  if (!user || !user.isActive) throw new AppError('User not found', 404);

  if (phone && phone !== user.phone) {
    const existing = await User.findOne({ phone, _id: { $ne: userId } });
    if (existing) {
      throw new AppError(
        'This mobile number is already associated with another account.',
        409
      );
    }
    user.phone = phone;
  }
  if (name) user.name = name;
  const changed = user.isModified();
  await user.save();
  if (changed) await onProfileUpdated(user);

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
};

const deleteMe = async (userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const user = await User.findById(userId).session(session);
    if (!user) throw new AppError('User not found', 404);

    const randomHash = await bcrypt.hash(
      `deleted-${Date.now()}-${Math.random()}`,
      env.BCRYPT_COST
    );

    user.email = `[DELETED] ${user._id}:${user.email}`;
    user.phone = null;
    user.isActive = false;
    user.passwordHash = randomHash;
    await user.save({ session });

    await Address.deleteMany({ userId }).session(session);
    await Cart.deleteMany({ userId }).session(session);

    await session.commitTransaction();
    return { message: 'Account anonymized successfully' };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

const listCustomers = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { role: 'CUSTOMER' };
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true' || query.isActive === true;
  }
  if (query.search) {
    const s = query.search.trim();
    filter.$or = [
      { name: new RegExp(s, 'i') },
      { email: new RegExp(s, 'i') },
    ];
  }

  const [data, total] = await Promise.all([
    User.find(filter)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  const mapped = data.map((u) => ({
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    phone: u.phone,
    isActive: u.isActive,
    totalOrders: u.totalOrders,
    totalSpent: Number(u.totalSpent).toFixed(2),
    createdAt: u.createdAt,
  }));

  return { data: mapped, meta: buildMeta(total, page, limit) };
};

const toggleCustomerStatus = async (adminId, customerId, isActive) => {
  if (adminId === customerId) {
    throw new AppError('Cannot change your own status', 400);
  }
  const user = await User.findById(customerId);
  if (!user) throw new AppError('User not found', 404);
  if (user.role !== 'CUSTOMER') {
    throw new AppError('Insufficient permissions', 403);
  }
  user.isActive = Boolean(isActive);
  await user.save();
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    isActive: user.isActive,
  };
};

module.exports = {
  getStats,
  updateMe,
  deleteMe,
  listCustomers,
  toggleCustomerStatus,
};
