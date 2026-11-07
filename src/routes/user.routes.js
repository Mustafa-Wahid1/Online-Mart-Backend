'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const adminRouter = express.Router();

const userController = require('../controllers/user.controller');
const addressController = require('../controllers/address.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAdmin } = require('../middlewares/roles.middleware');

// ── Current user (customer) ─────────────────────────────────
router.get('/me/stats', userController.getStats);

router.patch(
  '/me',
  [
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('phone').optional({ nullable: true }).isString(),
  ],
  validate,
  userController.updateMe
);

router.delete('/me', userController.deleteMe);

// ── Admin (customers) ───────────────────────────────────────
adminRouter.use(requireAdmin);

adminRouter.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('isActive').optional().isIn(['true', 'false']),
    query('search').optional().isString(),
  ],
  validate,
  userController.listCustomers
);

adminRouter.patch(
  '/:id/status',
  [
    param('id').isMongoId().withMessage('Invalid customer id'),
    body('isActive').notEmpty().isBoolean().withMessage('isActive is required'),
  ],
  validate,
  userController.toggleStatus
);

// Customer addresses (admin read-only view)
adminRouter.get(
  '/:id/addresses',
  [param('id').isMongoId().withMessage('Invalid customer id')],
  validate,
  addressController.listByCustomer
);

module.exports = router;
module.exports.admin = adminRouter;
