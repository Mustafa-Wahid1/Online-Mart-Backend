'use strict';

const userService = require('../services/user.service');
const { success } = require('../utils/response');

const getStats = async (req, res, next) => {
  try {
    const data = await userService.getStats(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const updateMe = async (req, res, next) => {
  try {
    const data = await userService.updateMe(req.user.id, req.body);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const deleteMe = async (req, res, next) => {
  try {
    const data = await userService.deleteMe(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const listCustomers = async (req, res, next) => {
  try {
    const result = await userService.listCustomers(req.query);
    return success(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const toggleStatus = async (req, res, next) => {
  try {
    const data = await userService.toggleCustomerStatus(
      req.user.id,
      req.params.id,
      req.body.isActive
    );
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStats,
  updateMe,
  deleteMe,
  listCustomers,
  toggleStatus,
};
