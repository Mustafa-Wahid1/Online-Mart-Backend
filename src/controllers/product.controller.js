'use strict';

const productService = require('../services/product.service');
const { success } = require('../utils/response');

const listPublic = async (req, res, next) => {
  try {
    const result = await productService.listPublic(req.query);
    return success(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getPublicById = async (req, res, next) => {
  try {
    const data = await productService.getPublicById(req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const listAdmin = async (req, res, next) => {
  try {
    const result = await productService.listAdmin(req.query);
    return success(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getAdminById = async (req, res, next) => {
  try {
    const data = await productService.getAdminById(req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = await productService.create(req.body);
    return success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const data = await productService.update(req.params.id, req.body);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const deactivate = async (req, res, next) => {
  try {
    const data = await productService.deactivate(req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listPublic,
  getPublicById,
  listAdmin,
  getAdminById,
  create,
  update,
  deactivate,
};
