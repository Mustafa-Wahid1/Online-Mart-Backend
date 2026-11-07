'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const paymentController = require('../controllers/payment.controller');
const validate = require('../middlewares/validate.middleware');
const { requireCustomer } = require('../middlewares/roles.middleware');
const { paymentLimiter } = require('../middlewares/rateLimit.middleware');

router.post(
  '/initiate',
  requireCustomer,
  paymentLimiter,
  [
    body('orderId').notEmpty().isMongoId().withMessage('Valid orderId is required'),
  ],
  validate,
  paymentController.initiate
);

router.post(
  '/:id/capture',
  requireCustomer,
  [param('id').isMongoId().withMessage('Invalid payment id')],
  validate,
  paymentController.capture
);

router.post(
  '/:id/mock-complete',
  requireCustomer,
  [param('id').isMongoId().withMessage('Invalid payment id')],
  validate,
  paymentController.mockComplete
);

module.exports = router;
