'use strict';

const cartService = require('../services/cart.service');
const { success } = require('../utils/response');

const getCart = async (req, res, next) => {
  try {
    const data = await cartService.getOrCreate(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const addItem = async (req, res, next) => {
  try {
    const data = await cartService.addItem(req.user.id, req.body);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const data = await cartService.updateItem(req.user.id, req.params.id, req.body);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const removeItem = async (req, res, next) => {
  try {
    const data = await cartService.removeItem(req.user.id, req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const clearCart = async (req, res, next) => {
  try {
    const data = await cartService.clear(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};
