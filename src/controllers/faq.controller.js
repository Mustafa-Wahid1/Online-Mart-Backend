'use strict';

const faqService = require('../services/faq.service');
const { success } = require('../utils/response');

const list = async (req, res, next) => {
  try {
    const data = await faqService.listFaqs(req.query);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const listAdmin = async (req, res, next) => {
  try {
    const result = await faqService.listAdmin(req.query);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

const getAdminById = async (req, res, next) => {
  try {
    const data = await faqService.getAdminById(req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = await faqService.create(req.body);
    return success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const data = await faqService.update(req.params.id, req.body);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const data = await faqService.remove(req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const toggle = async (req, res, next) => {
  try {
    const data = await faqService.toggle(req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list,
  listAdmin,
  getAdminById,
  create,
  update,
  remove,
  toggle,
};
