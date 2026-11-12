'use strict';

const Order = require('../../models/Order.model');
const AppError = require('../../utils/AppError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { formatOrder } = require('./orderCreation.service');

/**
 * Customer's own orders.
 */
const listMine = async (userId, query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { userId };

  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;

  const [data, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);

  return {
    data: await Promise.all(data.map((o) => formatOrder(o))),
    meta: buildMeta(total, page, limit),
  };
};

/**
 * Customer order detail — ownership → 404.
 */
const getMineById = async (userId, orderId) => {
  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) throw new AppError('Order not found', 404);
  return await formatOrder(order);
};

/**
 * Admin list all orders.
 */
const listAdmin = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.userId) filter.userId = query.userId;
  if (query.orderNumber) {
    filter.orderNumber = new RegExp(query.orderNumber.trim(), 'i');
  }
  if (query.deliveryType) filter.deliveryType = query.deliveryType;

  // Search by order number OR customer name/email
  const searchTerm = query.q || query.search;
  if (searchTerm && String(searchTerm).trim()) {
    const q = String(searchTerm).trim();
    const User = require('../../models/User.model');
    const users = await User.find({
      $or: [
        { name: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
      ],
    })
      .select('_id')
      .lean();
    const userIds = users.map((u) => u._id);
    filter.$or = [
      { orderNumber: new RegExp(q, 'i') },
      ...(userIds.length ? [{ userId: { $in: userIds } }] : []),
    ];
  }

  const [data, total] = await Promise.all([
    Order.find(filter)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  return {
    data: await Promise.all(data.map((o) => formatOrder(o))),
    meta: buildMeta(total, page, limit),
  };
};

/**
 * Admin order detail.
 */
const getAdminById = async (orderId) => {
  const order = await Order.findById(orderId).populate('userId', 'name email');
  if (!order) throw new AppError('Order not found', 404);
  return await formatOrder(order);
};

/**
 * Public order tracking — orderNumber + customer email must match.
 * Returns limited safe fields only.
 */
const trackByNumberAndEmail = async (orderNumber, email) => {
  const number = String(orderNumber || '').trim();
  const addr = String(email || '').trim().toLowerCase();
  if (!number || !addr) {
    throw new AppError('Order ID and email are required', 400, 'VALIDATION_ERROR');
  }

  const order = await Order.findOne({ orderNumber: number }).populate('userId', 'name email');
  if (!order) {
    throw new AppError('No order found for that ID and email', 404, 'ORDER_NOT_FOUND');
  }

  const ownerEmail = order.userId && order.userId.email
    ? String(order.userId.email).toLowerCase()
    : '';
  if (!ownerEmail || ownerEmail !== addr) {
    throw new AppError('No order found for that ID and email', 404, 'ORDER_NOT_FOUND');
  }

  const full = await formatOrder(order);
  return {
    id: full.id,
    orderNumber: full.orderNumber,
    status: full.status,
    paymentStatus: full.paymentStatus,
    deliveryType: full.deliveryType,
    items: full.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      imageUrl: i.imageUrl || '',
    })),
    total: full.total,
    scheduledAt: order.scheduledAt || order.pickupScheduledAt || null,
    estimatedDelivery: order.scheduledAt || order.pickupScheduledAt || null,
    events: full.events,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
  };
};

module.exports = {
  listMine,
  getMineById,
  listAdmin,
  getAdminById,
  trackByNumberAndEmail,
};