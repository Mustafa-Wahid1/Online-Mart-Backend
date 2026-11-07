'use strict';

const express = require('express');
const { param } = require('express-validator');
const router = express.Router();

const { requireAdmin } = require('../middlewares/roles.middleware');
const validate = require('../middlewares/validate.middleware');
const uploadController = require('../controllers/upload.controller');
const { upload } = require('../middlewares/upload.middleware');

// Domain admin routers — each domain owns its own routes
const categoryRoutes = require('./category.routes');
const productRoutes = require('./product.routes');
const inventoryRoutes = require('./inventory.routes');
const orderRoutes = require('./order.routes');
const userRoutes = require('./user.routes');

// All admin routes require ADMIN role
router.use(requireAdmin);

// ── Categories ──────────────────────────────────────────────
router.use('/categories', categoryRoutes.admin);

// ── Products ────────────────────────────────────────────────
router.use('/products', productRoutes.admin);

// ── Inventory ───────────────────────────────────────────────
router.use('/inventory', inventoryRoutes.admin);

// ── Orders ──────────────────────────────────────────────────
router.use('/orders', orderRoutes.admin);

// ── Customers ───────────────────────────────────────────────
router.use('/customers', userRoutes.admin);
 
// ── Uploads ─────────────────────────────────────────────────
router.post(
  '/uploads/product-image',
  upload.single('image'),
  uploadController.productImage
);

router.delete(
  '/uploads/image/:imageId',
  [param('imageId').isMongoId().withMessage('Invalid image id')],
  validate,
  uploadController.deleteImage
);

// Placeholder for remaining modules
router.use((req, res) => {
  res.status(501).json({
    statusCode: 501,
    message: 'Admin endpoint not implemented yet',
    error: 'Not Implemented',
  });
});

module.exports = router;
