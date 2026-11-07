'use strict';

const categoryService = require('../services/category.service');
const { success } = require('../utils/response');

const listPublic = async (req, res, next) => {
  try {
    const data = await categoryService.listPublic();
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const listAdmin = async (req, res, next) => {
  try {
    const result = await categoryService.listAdmin(req.query);
    return success(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const isAdmin = req.user && req.user.role === 'ADMIN';
    const data = await categoryService.getById(req.params.id, { admin: isAdmin });
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = await categoryService.create(req.body);
    return success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const data = await categoryService.update(req.params.id, req.body);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const data = await categoryService.remove(req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listPublic,
  listAdmin,
  getById,
  create,
  update,
  remove,
};
