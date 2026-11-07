'use strict';

const paymentService = require('../services/payment/payment.service');
const webhookService = require('../services/payment/webhook.service');
const { success } = require('../utils/response');

const initiate = async (req, res, next) => {
  try {
    const data = await paymentService.initiate(req.user.id, req.body);
    return success(res, data, 201);
  } catch (err) {
    next(err);
  }
};

const capture = async (req, res, next) => {
  try {
    const data = await paymentService.capture(req.user.id, req.params.id, req.body);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const mockComplete = async (req, res, next) => {
  try {
    const data = await paymentService.mockComplete(req.user.id, req.params.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

const mockWebhook = async (req, res, next) => {
  try {
    const signature =
      req.headers['x-webhook-signature'] ||
      req.headers['x-mock-signature'] ||
      req.body.signature;
    const event = req.body.event || req.body;
    const data = await webhookService.handleMockWebhook(event, signature);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  initiate,
  capture,
  mockComplete,
  mockWebhook,
};
