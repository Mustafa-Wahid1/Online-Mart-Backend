'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const wishlistController = require('../controllers/wishlist.controller');
const validate = require('../middlewares/validate.middleware');
const { requireCustomer } = require('../middlewares/roles.middleware');

router.use(requireCustomer);

router.get('/', wishlistController.getWishlist);

router.get(
  '/check/:productId',
  [param('productId').isMongoId().withMessage('Invalid product id')],
  validate,
  wishlistController.checkProduct
);

router.post(
  '/items',
  [
    body('productId').notEmpty().isMongoId().withMessage('Valid productId is required'),
  ],
  validate,
  wishlistController.addItem
);

router.delete(
  '/items/:id',
  [param('id').isMongoId().withMessage('Invalid wishlist item id')],
  validate,
  wishlistController.removeItem
);

router.delete(
  '/product/:productId',
  [param('productId').isMongoId().withMessage('Invalid product id')],
  validate,
  wishlistController.removeByProduct
);

router.delete('/', wishlistController.clearWishlist);

module.exports = router;
