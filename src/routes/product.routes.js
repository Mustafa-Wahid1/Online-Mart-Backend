'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const adminRouter = express.Router();

const { requireAdmin } = require('../middlewares/roles.middleware');
const validate = require('../middlewares/validate.middleware');
const productController = require('../controllers/product.controller');

// ── Public ──────────────────────────────────────────────────
/**
 * @swagger
 * /products:
 *   get:
 *     summary: List active products (public)
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: categoryId
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated active products
 */
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('categoryId').optional().isMongoId(),
    query('search').optional().isString(),
    query('minPrice').optional().isFloat({ min: 0 }),
    query('maxPrice').optional().isFloat({ min: 0 }),
  ],
  validate,
  productController.listPublic
);

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get product detail (public, active only)
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product detail
 *       404:
 *         description: Not found or inactive
 */
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid product id')],
  validate,
  productController.getPublicById
);

// ── Admin ───────────────────────────────────────────────────
adminRouter.use(requireAdmin);

adminRouter.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('isActive').optional().isIn(['true', 'false']),
    query('categoryId').optional().isMongoId(),
    query('search').optional().isString(),
  ],
  validate,
  productController.listAdmin
);

adminRouter.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid product id')],
  validate,
  productController.getAdminById
);

adminRouter.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 200 }),
    body('categoryId').notEmpty().isMongoId().withMessage('Valid categoryId is required'),
    body('price').isFloat({ min: 0.01 }).withMessage('Price must be >= 0.01'),
    body('description').optional().isString().isLength({ max: 2000 }),
    body('unit').optional().isString().isLength({ max: 30 }),
    body('minimumOrderQuantity').optional().isInt({ min: 1 }),
    body('maximumOrderQuantity').optional().isInt({ min: 1 }),
    body('imageUrl').optional().isString(),
    body('initialQty').optional().isInt({ min: 0 }),
    body('lowStockThreshold').optional().isInt({ min: 0 }),
  ],
  validate,
  productController.create
);

adminRouter.patch(
  '/:id',
  [
    param('id').isMongoId().withMessage('Invalid product id'),
    body('name').optional().trim().notEmpty().isLength({ max: 200 }),
    body('categoryId').optional().isMongoId(),
    body('price').optional().isFloat({ min: 0.01 }),
    body('description').optional().isString().isLength({ max: 2000 }),
    body('unit').optional().isString().isLength({ max: 30 }),
    body('minimumOrderQuantity').optional().isInt({ min: 1 }),
    body('maximumOrderQuantity').optional().isInt({ min: 1 }),
    body('imageUrl').optional().isString(),
    body('isActive').optional().isBoolean(),
  ],
  validate,
  productController.update
);

// Soft delete: sets isActive = false (no hard delete)
adminRouter.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid product id')],
  validate,
  productController.deactivate
);

module.exports = router;
module.exports.admin = adminRouter;
