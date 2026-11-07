'use strict';

const addressService = require('../services/address.service');
const { success } = require('../utils/response');

const list = async (req, res, next) => {
  try {
    const data = await addressService.list(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const data = await addressService.getById(req.user.id, req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = await addressService.create(req.user.id, req.body);
    return success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const data = await addressService.update(req.user.id, req.params.id, req.body);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const data = await addressService.remove(req.user.id, req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const setDefault = async (req, res, next) => {
  try {
    const data = await addressService.setDefault(req.user.id, req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

/** Admin: list addresses for a given customer */
const listByCustomer = async (req, res, next) => {
  try {
    const data = await addressService.list(req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = { list, getById, create, update, remove, setDefault, listByCustomer };

