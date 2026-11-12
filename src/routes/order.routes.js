'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const adminRouter = express.Router();

const orderController = require('../controllers/order.controller');
const validate = require('../middlewares/validate.middleware');
const { requireCustomer, requireAdmin } = require('../middlewares/roles.middleware');
const { orderLimiter } = require('../middlewares/rateLimit.middleware');

// ── Public tracking ─────────────────────────────────────────
router.get(
  '/track',
  [
    query('orderId').trim().notEmpty().withMessage('Order ID is required'),
    query('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  ],
  validate,
  orderController.track
);

// ── Customer ────────────────────────────────────────────────
router.post(
  '/',
  requireCustomer,
  orderLimiter,
  [
    body('deliveryType')
      .notEmpty()
      .isIn(['DELIVERY', 'PICKUP'])
      .withMessage('deliveryType must be DELIVERY or PICKUP'),
    body('addressId').optional().isMongoId(),
    body('address').optional().isObject(),
    body('address.line1').optional().isString(),
    body('address.city').optional().isString(),
    body('address.postcode').optional().isString(),
    body('pickupScheduledAt').optional().isISO8601(),
  ],
  validate,
  orderController.create
);

router.get(
  '/me',
  requireCustomer,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isString(),
    query('paymentStatus').optional().isString(),
  ],
  validate,
  orderController.listMine
);

router.get(
  '/me/:id',
  requireCustomer,
  [param('id').isMongoId().withMessage('Invalid order id')],
  validate,
  orderController.getMineById
);

router.patch(
  '/me/:id/cancel',
  requireCustomer,
  orderLimiter,
  [
    param('id').isMongoId().withMessage('Invalid order id'),
    body('reason').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  orderController.cancelMine
);

// ── Admin ───────────────────────────────────────────────────
adminRouter.use(requireAdmin);

adminRouter.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isString(),
    query('paymentStatus').optional().isString(),
    query('userId').optional().isMongoId(),
    query('orderNumber').optional().isString(),
    query('deliveryType').optional().isIn(['DELIVERY', 'PICKUP']),
    query('search').optional().isString(),
    query('q').optional().isString(),
  ],
  validate,
  orderController.listAdmin
);

adminRouter.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid order id')],
  validate,
  orderController.getAdminById
);

adminRouter.patch(
  '/:id/status',
  [
    param('id').isMongoId().withMessage('Invalid order id'),
    body('status').notEmpty().isString().withMessage('status is required'),
  ],
  validate,
  orderController.updateStatus
);

adminRouter.patch(
  '/:id/cancel',
  [
    param('id').isMongoId().withMessage('Invalid order id'),
    body('reason').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  orderController.cancelAdmin
);

module.exports = router;
module.exports.admin = adminRouter;
