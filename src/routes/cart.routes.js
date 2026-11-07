'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const cartController = require('../controllers/cart.controller');
const validate = require('../middlewares/validate.middleware');
const { requireCustomer } = require('../middlewares/roles.middleware');

// All cart routes require CUSTOMER role
router.use(requireCustomer);

/**
 * @swagger
 * /cart:
 *   get:
 *     summary: Get or create current user's cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart with items
 */
router.get('/', cartController.getCart);

/**
 * @swagger
 * /cart/items:
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/items',
  [
    body('productId').notEmpty().isMongoId().withMessage('Valid productId is required'),
    body('quantity').notEmpty().isInt({ min: 1 }).withMessage('quantity must be a positive integer'),
  ],
  validate,
  cartController.addItem
);

router.patch(
  '/items/:id',
  [
    param('id').isMongoId().withMessage('Invalid cart item id'),
    body('quantity').notEmpty().isInt({ min: 1 }).withMessage('quantity must be a positive integer'),
  ],
  validate,
  cartController.updateItem
);

router.delete(
  '/items/:id',
  [param('id').isMongoId().withMessage('Invalid cart item id')],
  validate,
  cartController.removeItem
);

/**
 * @swagger
 * /cart:
 *   delete:
 *     summary: Clear cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/', cartController.clearCart);

module.exports = router;
