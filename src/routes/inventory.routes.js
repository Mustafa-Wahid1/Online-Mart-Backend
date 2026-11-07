'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const adminRouter = express.Router();

const { requireAdmin } = require('../middlewares/roles.middleware');
const validate = require('../middlewares/validate.middleware');
const inventoryController = require('../controllers/inventory.controller');

// Inventory is admin-only for now (no public routes)

// ── Admin ───────────────────────────────────────────────────
adminRouter.use(requireAdmin);

adminRouter.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']),
    query('productId').optional().isMongoId(),
  ],
  validate,
  inventoryController.list
);

// Global recent transactions — must be before /:id
adminRouter.get(
  '/transactions',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  inventoryController.listRecentTransactions
);

// Inventory by product id — must be before /:id
adminRouter.get(
  '/product/:productId',
  [param('productId').isMongoId().withMessage('Invalid product id')],
  validate,
  inventoryController.getByProductId
);

adminRouter.post(
  '/adjustments',
  [
    body('productId').optional().isMongoId(),
    body('inventoryId').optional().isMongoId(),
    body('type')
      .notEmpty()
      .withMessage('type is required')
      .isString(),
    body('quantity')
      .notEmpty()
      .withMessage('quantity is required')
      .isInt()
      .withMessage('quantity must be an integer'),
    body('reason').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  inventoryController.adjust
);

adminRouter.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid inventory id')],
  validate,
  inventoryController.getById
);

adminRouter.post(
  '/',
  [
    body('productId').notEmpty().isMongoId().withMessage('Valid productId is required'),
    body('qtyOnHand').optional().isInt({ min: 0 }),
    body('lowStockThreshold').optional().isInt({ min: 0 }),
  ],
  validate,
  inventoryController.create
);

adminRouter.get(
  '/:id/transactions',
  [
    param('id').isMongoId().withMessage('Invalid inventory id'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('type').optional().isString(),
  ],
  validate,
  inventoryController.listTransactions
);

adminRouter.patch(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid inventory id'),
    body('lowStockThreshold').notEmpty().isInt({ min: 0 }),
  ],
  validate,
  inventoryController.updateThreshold
);

module.exports = router;
module.exports.admin = adminRouter;
