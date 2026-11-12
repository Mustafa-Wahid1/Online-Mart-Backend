'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const adminRouter = express.Router();
const faqController = require('../controllers/faq.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAdmin } = require('../middlewares/roles.middleware');

// ── Public ──────────────────────────────────────────────────
router.get('/', faqController.list);

// ── Admin ───────────────────────────────────────────────────
adminRouter.use(requireAdmin);

const categories = ['Orders', 'Shipping', 'Payments', 'Returns', 'Account'];

adminRouter.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('category').optional().isString(),
    query('q').optional().isString(),
    query('search').optional().isString(),
  ],
  validate,
  faqController.listAdmin
);

adminRouter.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid FAQ id')],
  validate,
  faqController.getAdminById
);

adminRouter.post(
  '/',
  [
    body('question').trim().notEmpty().withMessage('Question is required').isLength({ max: 500 }),
    body('answer').trim().notEmpty().withMessage('Answer is required').isLength({ max: 5000 }),
    body('category').isIn(categories).withMessage('Invalid category'),
    body('order').optional().isInt({ min: 0 }),
    body('isActive').optional().isBoolean(),
  ],
  validate,
  faqController.create
);

adminRouter.put(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid FAQ id'),
    body('question').optional().trim().notEmpty().isLength({ max: 500 }),
    body('answer').optional().trim().notEmpty().isLength({ max: 5000 }),
    body('category').optional().isIn(categories),
    body('order').optional().isInt({ min: 0 }),
    body('isActive').optional().isBoolean(),
  ],
  validate,
  faqController.update
);

adminRouter.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid FAQ id')],
  validate,
  faqController.remove
);

adminRouter.patch(
  '/:id/toggle',
  [param('id').isMongoId().withMessage('Invalid FAQ id')],
  validate,
  faqController.toggle
);

module.exports = router;
module.exports.admin = adminRouter;
