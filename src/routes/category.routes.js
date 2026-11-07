'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const adminRouter = express.Router();

const { requireAdmin } = require('../middlewares/roles.middleware');
const validate = require('../middlewares/validate.middleware');
const categoryController = require('../controllers/category.controller');

// ── Public ──────────────────────────────────────────────────
/**
 * @swagger
 * /categories:
 *   get:
 *     summary: List active categories (public, nested)
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: Nested list of active categories
 */
router.get('/', categoryController.listPublic);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid category id')],
  validate,
  categoryController.getById
);

// ── Admin ───────────────────────────────────────────────────
adminRouter.use(requireAdmin);

adminRouter.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('isActive').optional().isIn(['true', 'false']),
    query('parentId').optional(),
    query('search').optional().isString(),
  ],
  validate,
  categoryController.listAdmin
);

adminRouter.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid category id')],
  validate,
  categoryController.getById
);

adminRouter.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('parentId').optional({ nullable: true }).isMongoId().withMessage('Invalid parentId'),
    body('description').optional().isString().isLength({ max: 500 }),
    body('isActive').optional().isBoolean(),
    body('imageUrl').optional().isString(),
  ],
  validate,
  categoryController.create
);

adminRouter.patch(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid category id'),
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('parentId').optional({ nullable: true }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('isActive').optional().isBoolean(),
    body('imageUrl').optional().isString(),
  ],
  validate,
  categoryController.update
);

adminRouter.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid category id')],
  validate,
  categoryController.remove
);

module.exports = router;
module.exports.admin = adminRouter;
