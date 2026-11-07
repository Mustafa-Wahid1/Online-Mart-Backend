'use strict';

const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const plain = (value) => JSON.parse(JSON.stringify(value || {}));

const toDTO = (n) => {
  const obj = n.toObject ? n.toObject() : n;
  return {
    id: obj._id.toString(),
    type: obj.type,
    title: obj.title,
    message: obj.message,
    data: obj.data || {},
    readAt: obj.readAt || null,
    createdAt: obj.createdAt,
  };
};

const resolveRecipients = async ({ userId, userIds, role }) => {
  if (role === 'ADMIN') {
    const admins = await User.find({ role: 'ADMIN', isActive: true }).select('_id').lean();
    return admins.map((a) => a._id.toString());
  }
  if (Array.isArray(userIds)) return [...new Set(userIds.map(String))];
  if (userId) return [String(userId)];
  return [];
};

const emitLive = (userId, dto) => {
  try {
    require('../sockets').emitToUser(userId, 'notification:new', dto);
  } catch (err) {
    logger.warn({ err: err.message }, 'Notification socket emit failed');
  }
};

/**
 * Single entry point for every notification.
 * Saves one row per recipient, then pushes it live over the socket.
 * Never throws: a notification failure must not affect the original operation.
 */
const notify = async ({ userId, userIds, role, type, title, message, data = {}, dedupeKey }) => {
  try {
    const recipients = await resolveRecipients({ userId, userIds, role });
    if (recipients.length === 0) return [];

    const cleanData = plain(data);
    const key =
      dedupeKey ||
      `${type}:${cleanData.orderId || cleanData.productId || ''}:${cleanData.status || ''}`;

    const created = [];
    for (const recipientId of recipients) {
      try {
        const doc = await Notification.create({
          userId: recipientId,
          type,
          title,
          message,
          data: cleanData,
          dedupeKey: key,
        });
        const dto = toDTO(doc);
        created.push(dto);
        emitLive(recipientId, dto);
      } catch (err) {
        if (err && err.code === 11000) continue; // same event already notified
        logger.error({ err: err.message, type, userId: recipientId }, 'Notification save failed');
      }
    }
    return created;
  } catch (err) {
    logger.error({ err: err.message, type }, 'Notification failed');
    return [];
  }
};

const parseLimit = (raw) => {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
};

const encodeCursor = (n) => `${new Date(n.createdAt).getTime()}_${n._id.toString()}`;

const decodeCursor = (cursor) => {
  const [ms, id] = String(cursor).split('_');
  const time = Number(ms);
  if (!Number.isFinite(time) || !/^[a-f0-9]{24}$/i.test(id || '')) {
    throw new AppError('Invalid cursor', 400);
  }
  return { createdAt: new Date(time), id };
};

const list = async (userId, query = {}) => {
  const limit = parseLimit(query.limit);
  const filter = { userId };

  if (query.unread === 'true') filter.readAt = null;

  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    filter.$or = [
      { createdAt: { $lt: c.createdAt } },
      { createdAt: c.createdAt, _id: { $lt: c.id } },
    ];
  }

  const docs = await Notification.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasNextPage = docs.length > limit;
  const page = hasNextPage ? docs.slice(0, limit) : docs;

  return {
    data: page.map(toDTO),
    meta: {
      limit,
      hasNextPage,
      nextCursor: hasNextPage ? encodeCursor(page[page.length - 1]) : null,
    },
  };
};

const unreadCount = async (userId) => {
  const count = await Notification.countDocuments({ userId, readAt: null });
  return { count };
};

const markRead = async (userId, id) => {
  const doc = await Notification.findOne({ _id: id, userId });
  if (!doc) throw new AppError('Notification not found', 404);
  if (!doc.readAt) {
    doc.readAt = new Date();
    await doc.save();
  }
  return toDTO(doc);
};

const markAllRead = async (userId) => {
  const res = await Notification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } }
  );
  return { updated: res.modifiedCount || 0 };
};

module.exports = {
  notify,
  list,
  unreadCount,
  markRead,
  markAllRead,
  toDTO,
};
