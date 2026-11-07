'use strict';

const notificationService = require('../services/notification.service');
const { success } = require('../utils/response');

const list = async (req, res, next) => {
  try {
    const result = await notificationService.list(req.user.id, req.query);
    return success(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const unreadCount = async (req, res, next) => {
  try {
    const data = await notificationService.unreadCount(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const markRead = async (req, res, next) => {
  try {
    const data = await notificationService.markRead(req.user.id, req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const markAllRead = async (req, res, next) => {
  try {
    const data = await notificationService.markAllRead(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = { list, unreadCount, markRead, markAllRead };
