'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const adminRouter = express.Router();
const contactController = require('../controllers/contact.controller');
const validate = require('../middlewares/validate.middleware');
const { globalLimiter } = require('../middlewares/rateLimit.middleware');
const { requireAdmin } = require('../middlewares/roles.middleware');

// ── Public: submit contact form ─────────────────────────────
router.post(
  '/',
  globalLimiter,
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Full name is required')
      .isLength({ max: 100 })
      .withMessage('Name is too long'),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('phone').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 30 }),
    body('subject')
      .trim()
      .notEmpty()
      .withMessage('Subject is required')
      .isLength({ max: 200 })
      .withMessage('Subject is too long'),
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ max: 5000 })
      .withMessage('Message is too long'),
  ],
  validate,
  contactController.create
);

// ── Admin: contact messages ─────────────────────────────────
adminRouter.use(requireAdmin);

adminRouter.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['NEW', 'READ', 'REPLIED', 'ARCHIVED', 'ALL']),
    query('q').optional().isString(),
    query('search').optional().isString(),
  ],
  validate,
  contactController.listAdmin
);

adminRouter.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid message id')],
  validate,
  contactController.getAdminById
);

adminRouter.patch(
  '/:id/status',
  [
    param('id').isMongoId().withMessage('Invalid message id'),
    body('status')
      .isIn(['NEW', 'READ', 'REPLIED', 'ARCHIVED'])
      .withMessage('Invalid status'),
  ],
  validate,
  contactController.updateStatus
);

adminRouter.post(
  '/:id/reply',
  [
    param('id').isMongoId().withMessage('Invalid message id'),
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Reply message is required')
      .isLength({ max: 5000 })
      .withMessage('Reply is too long'),
  ],
  validate,
  contactController.sendReply
);

module.exports = router;
module.exports.admin = adminRouter;
