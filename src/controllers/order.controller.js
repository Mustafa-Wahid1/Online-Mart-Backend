'use strict';

const orderCreation = require('../services/order/orderCreation.service');
const orderQuery = require('../services/order/orderQuery.service');
const orderStatus = require('../services/order/orderStatus.service');
const orderCancellation = require('../services/order/orderCancellation.service');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const data = await orderCreation.createOrder(req.user.id, req.body);
    return success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

const listMine = async (req, res, next) => {
  try {
    const result = await orderQuery.listMine(req.user.id, req.query);
    return success(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getMineById = async (req, res, next) => {
  try {
    const data = await orderQuery.getMineById(req.user.id, req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const cancelMine = async (req, res, next) => {
  try {
    const result = await orderCancellation.cancelByCustomer(
      req.user.id,
      req.params.id,
      req.body.reason
    );
    if (result.statusCode === 200 && result.message) {
      return res.status(200).json({
        data: result.order,
        message: result.message,
      });
    }
    return success(res, result.order);
  } catch (err) {
    next(err);
  }
};

const listAdmin = async (req, res, next) => {
  try {
    const result = await orderQuery.listAdmin(req.query);
    return success(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getAdminById = async (req, res, next) => {
  try {
    const data = await orderQuery.getAdminById(req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const data = await orderStatus.updateStatus(req.params.id, req.body.status);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const cancelAdmin = async (req, res, next) => {
  try {
    const result = await orderCancellation.cancelByAdmin(req.params.id, req.body.reason);
    if (result.statusCode === 200 && result.message) {
      return res.status(200).json({
        data: result.order,
        message: result.message,
      });
    }
    return success(res, result.order);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  create,
  listMine,
  getMineById,
  cancelMine,
  listAdmin,
  getAdminById,
  updateStatus,
  cancelAdmin,
};
