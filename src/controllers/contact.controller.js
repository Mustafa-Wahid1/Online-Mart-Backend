'use strict';

const contactService = require('../services/contact.service');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const data = await contactService.createContact(req.body);
    return success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

const listAdmin = async (req, res, next) => {
  try {
    const result = await contactService.listAdmin(req.query);
    // Frontend expects nested { data: { data: [], meta: {} } }
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

const getAdminById = async (req, res, next) => {
  try {
    const data = await contactService.getAdminById(req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const data = await contactService.updateStatus(req.params.id, req.body.status);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const sendReply = async (req, res, next) => {
  try {
    const data = await contactService.sendReply(req.params.id, req.body.message);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  create,
  listAdmin,
  getAdminById,
  updateStatus,
  sendReply,
};
