'use strict';

const wishlistService = require('../services/wishlist.service');
const { success } = require('../utils/response');

const getWishlist = async (req, res, next) => {
  try {
    const data = await wishlistService.getOrCreate(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const checkProduct = async (req, res, next) => {
  try {
    const inWishlist = await wishlistService.hasProduct(req.user.id, req.params.productId);
    return success(res, { productId: req.params.productId, inWishlist });
  } catch (err) {
    next(err);
  }
};

const addItem = async (req, res, next) => {
  try {
    const data = await wishlistService.addItem(req.user.id, req.body);
    return success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

const removeItem = async (req, res, next) => {
  try {
    const data = await wishlistService.removeItem(req.user.id, req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const removeByProduct = async (req, res, next) => {
  try {
    const data = await wishlistService.removeByProductId(req.user.id, req.params.productId);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const clearWishlist = async (req, res, next) => {
  try {
    const data = await wishlistService.clear(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getWishlist,
  checkProduct,
  addItem,
  removeItem,
  removeByProduct,
  clearWishlist,
};
