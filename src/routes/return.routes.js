'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const returnController = require('../controllers/return.controller');
const validate = require('../middlewares/validate.middleware');

router.get('/eligible', returnController.listEligible);

router.get('/my', returnController.listMine);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid return id')],
  validate,
  returnController.getMineById
);

router.post(
  '/',
  [
    body('orderId').isMongoId().withMessage('Valid order is required'),
    body('reason')
      .isIn(['DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'QUALITY_ISSUE', 'CHANGED_MIND', 'OTHER'])
      .withMessage('Valid reason is required'),
    body('comments').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 2000 }),
    body('itemProductIds')
      .isArray({ min: 1 })
      .withMessage('Select at least one item to return'),
    body('itemProductIds.*').isMongoId().withMessage('Invalid product id'),
    body('images').optional().isArray({ max: 5 }),
    body('images.*').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  returnController.create
);

module.exports = router;

// ── Admin ───────────────────────────────────────────────────
const adminRouter = express.Router();
const { requireAdmin } = require('../middlewares/roles.middleware');

adminRouter.use(requireAdmin);

adminRouter.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'ALL']),
    query('q').optional().isString(),
    query('search').optional().isString(),
  ],
  validate,
  returnController.listAdmin
);

adminRouter.get('/status-counts', returnController.statusCounts);

adminRouter.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid return id')],
  validate,
  returnController.getAdminById
);

adminRouter.patch(
  '/:id/status',
  [
    param('id').isMongoId().withMessage('Invalid return id'),
    body('status')
      .isIn(['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'])
      .withMessage('Invalid status'),
    body('adminNotes').optional().isString().isLength({ max: 2000 }),
  ],
  validate,
  returnController.updateStatus
);

module.exports.admin = adminRouter;
