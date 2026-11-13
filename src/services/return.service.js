'use strict';

const ReturnRequest = require('../models/Return.model');
const Order = require('../models/Order.model');
const AppError = require('../utils/AppError');
const { toString: moneyToString } = require('../utils/money');
const { parsePagination, buildMeta } = require('../utils/pagination');
const User = require('../models/User.model');
const { onReturnRequested, onReturnStatusChanged } = require('./notification.triggers');
const { completeReturn } = require('./payment/returnRefund.service');

/** Return window in days after delivery. */
const RETURN_WINDOW_DAYS = 14;

const REASON_LABELS = {
  DAMAGED: 'Item arrived damaged',
  WRONG_ITEM: 'Wrong item received',
  NOT_AS_DESCRIBED: 'Not as described',
  QUALITY_ISSUE: 'Quality issue',
  CHANGED_MIND: 'Changed my mind',
  OTHER: 'Other',
};

function formatReturn(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id),
    orderId: String(o.orderId),
    orderNumber: o.orderNumber,
    userId: String(o.userId),
    items: (o.items || []).map((i) => ({
      productId: String(i.productId),
      name: i.name,
      sku: i.sku || '',
      quantity: i.quantity,
      unitPrice: moneyToString(i.unitPrice),
      imageUrl: i.imageUrl || '',
    })),
    reason: o.reason,
    reasonLabel: REASON_LABELS[o.reason] || o.reason,
    comments: o.comments || '',
    images: o.images || [],
    status: o.status,
    adminNotes: o.adminNotes || '',
    refundAmount: o.refundAmount != null ? moneyToString(o.refundAmount) : null,
    refundedAt: o.refundedAt || null,
    restocked: Boolean(o.restocked),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

/**
 * Eligible delivered orders for the user within the return window.
 */
const listEligibleOrders = async (userId) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETURN_WINDOW_DAYS);

  const orders = await Order.find({
    userId,
    status: 'DELIVERED',
    updatedAt: { $gte: cutoff },
  })
    .sort({ updatedAt: -1 })
    .lean();

  // Exclude orders that already have a non-rejected return
  const orderIds = orders.map((o) => o._id);
  const existing = await ReturnRequest.find({
    orderId: { $in: orderIds },
    status: { $ne: 'REJECTED' },
  })
    .select('orderId')
    .lean();
  const blocked = new Set(existing.map((r) => String(r.orderId)));

  return orders
    .filter((o) => !blocked.has(String(o._id)))
    .map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber,
      status: o.status,
      total: moneyToString(o.total),
      deliveredAt: o.updatedAt,
      items: (o.items || []).map((i) => ({
        productId: String(i.productId),
        name: i.name,
        sku: i.sku || '',
        quantity: i.quantity,
        unitPrice: moneyToString(i.unitPrice),
        imageUrl: i.imageUrl || '',
      })),
    }));
};

/**
 * Create a return request.
 */
const createReturn = async (userId, payload) => {
  const orderId = payload.orderId;
  const reason = payload.reason;
  const comments = String(payload.comments || '').trim();
  const images = Array.isArray(payload.images) ? payload.images.filter(Boolean).slice(0, 5) : [];
  const itemProductIds = Array.isArray(payload.itemProductIds)
    ? payload.itemProductIds.map(String)
    : [];

  if (!orderId) throw new AppError('Order is required', 400, 'VALIDATION_ERROR');
  if (!reason || !REASON_LABELS[reason]) {
    throw new AppError('Valid reason is required', 400, 'VALIDATION_ERROR');
  }
  if (!itemProductIds.length) {
    throw new AppError('Select at least one item to return', 400, 'VALIDATION_ERROR');
  }

  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) throw new AppError('Order not found', 404);

  if (order.status !== 'DELIVERED') {
    throw new AppError('Only delivered orders can be returned', 400, 'ORDER_NOT_ELIGIBLE');
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETURN_WINDOW_DAYS);
  const deliveredAt = order.updatedAt || order.createdAt;
  if (deliveredAt < cutoff) {
    throw new AppError(
      `Returns must be requested within ${RETURN_WINDOW_DAYS} days of delivery`,
      400,
      'RETURN_WINDOW_EXPIRED'
    );
  }

  const existing = await ReturnRequest.findOne({
    orderId: order._id,
    userId,
    status: { $ne: 'REJECTED' },
  });
  if (existing) {
    throw new AppError('A return request already exists for this order', 400, 'RETURN_EXISTS');
  }

  const selected = order.items.filter((i) => itemProductIds.includes(String(i.productId)));
  if (!selected.length) {
    throw new AppError('Selected items do not belong to this order', 400, 'VALIDATION_ERROR');
  }

  const doc = await ReturnRequest.create({
    orderId: order._id,
    userId,
    orderNumber: order.orderNumber,
    items: selected.map((i) => ({
      productId: i.productId,
      name: i.name,
      sku: i.sku || '',
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      imageUrl: i.imageUrl || '',
    })),
    reason,
    comments,
    images,
    status: 'PENDING',
  });

  // Notify admins (never throws)
  await onReturnRequested(doc);

  return formatReturn(doc);
};

const listMine = async (userId) => {
  const rows = await ReturnRequest.find({ userId }).sort({ createdAt: -1 });
  return rows.map(formatReturn);
};

const getMineById = async (userId, id) => {
  const doc = await ReturnRequest.findOne({ _id: id, userId });
  if (!doc) throw new AppError('Return request not found', 404);
  return formatReturn(doc);
};



/**
 * Format a return for admin (includes customer info).
 */
const formatReturnAdmin = (doc, user) => {
  const base = formatReturn(doc);
  return {
    ...base,
    customerName: user ? user.name : '',
    customerEmail: user ? user.email : '',
    customerPhone: user ? (user.phone || '') : '',
  };
};

/**
 * Admin: list returns with filters + pagination.
 */
const listAdmin = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }

  const searchTerm = query.q || query.search;
  if (searchTerm && String(searchTerm).trim()) {
    const q = String(searchTerm).trim();
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({
      $or: [{ name: regex }, { email: regex }],
    })
      .select('_id')
      .lean();
    const userIds = users.map((u) => u._id);
    filter.$or = [
      { orderNumber: regex },
      ...(userIds.length ? [{ userId: { $in: userIds } }] : []),
    ];
  }

  const [docs, total] = await Promise.all([
    ReturnRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ReturnRequest.countDocuments(filter),
  ]);

  // Load customers
  const userIds = [...new Set(docs.map((d) => String(d.userId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select('name email phone')
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const meta = buildMeta(total, page, limit);

  return {
    data: docs.map((d) => formatReturnAdmin(d, userMap.get(String(d.userId)))),
    meta: {
      page: meta.currentPage,
      limit: meta.limit,
      total: meta.total,
      totalPages: meta.pages,
    },
  };
};

/**
 * Admin: number of return requests per status (dashboard).
 */
const statusCounts = async () => {
  const rows = await ReturnRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0, COMPLETED: 0 };
  for (const r of rows) {
    if (r._id in counts) counts[r._id] = r.count;
  }
  return counts;
};

/**
 * Admin: get a single return by id.
 */
const getAdminById = async (id) => {
  const doc = await ReturnRequest.findById(id);
  if (!doc) throw new AppError('Return not found', 404, 'NOT_FOUND');
  const user = await User.findById(doc.userId).select('name email phone').lean();
  return formatReturnAdmin(doc, user);
};

/**
 * Admin: update status and notes.
 */
const updateStatus = async (id, status, adminNotes) => {
  const allowed = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'];
  if (!allowed.includes(status)) {
    throw new AppError('Invalid status', 400, 'VALIDATION_ERROR');
  }

  const doc = await ReturnRequest.findById(id);
  if (!doc) throw new AppError('Return not found', 404, 'NOT_FOUND');

  if (status === 'REJECTED') {
    const notes = String(adminNotes || '').trim();
    if (notes.length < 3) {
      throw new AppError('Please provide a reason when rejecting', 400, 'VALIDATION_ERROR');
    }
  }

  const prevStatus = doc.status;

  if (prevStatus === 'COMPLETED' && status !== 'COMPLETED') {
    throw new AppError('A completed return cannot be changed', 400, 'RETURN_COMPLETED');
  }

  // Completing a return refunds the customer, restocks items and updates stats (one transaction).
  if (status === 'COMPLETED' && prevStatus !== 'COMPLETED') {
    const completed = await completeReturn(id, adminNotes);
    await onReturnStatusChanged(completed, prevStatus);
    const customer = await User.findById(completed.userId).select('name email phone').lean();
    return formatReturnAdmin(completed, customer);
  }

  doc.status = status;
  if (adminNotes !== undefined) {
    doc.adminNotes = String(adminNotes || '').trim();
  }
  await doc.save();

  // Notify the customer about the decision (never throws)
  await onReturnStatusChanged(doc, prevStatus);

  const user = await User.findById(doc.userId).select('name email phone').lean();
  return formatReturnAdmin(doc, user);
};

module.exports = {
  listEligibleOrders,
  createReturn,
  listMine,
  getMineById,
  listAdmin,
  statusCounts,
  getAdminById,
  updateStatus,
  REASON_LABELS,
  RETURN_WINDOW_DAYS,
};
