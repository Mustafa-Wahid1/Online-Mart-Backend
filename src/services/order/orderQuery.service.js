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
 * Admin order detail.
 */
const getAdminById = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);
  return await formatOrder(order);
};

module.exports = {
  listMine,
  getMineById,
  listAdmin,
  getAdminById,
};