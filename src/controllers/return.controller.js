'use strict';

const returnService = require('../services/return.service');
const { success } = require('../utils/response');

const listEligible = async (req, res, next) => {
  try {
    const data = await returnService.listEligibleOrders(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = await returnService.createReturn(req.user.id, req.body);
    return success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

const listMine = async (req, res, next) => {
  try {
    const data = await returnService.listMine(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const getMineById = async (req, res, next) => {
  try {
    const data = await returnService.getMineById(req.user.id, req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const listAdmin = async (req, res, next) => {
  try {
    const result = await returnService.listAdmin(req.query);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

const getAdminById = async (req, res, next) => {
  try {
    const data = await returnService.getAdminById(req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const data = await returnService.updateStatus(
      req.params.id,
      req.body.status,
      req.body.adminNotes
    );
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listEligible,
  create,
  listMine,
  getMineById,
  listAdmin,
  getAdminById,
  updateStatus,
};
