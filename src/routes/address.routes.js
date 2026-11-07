'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const addressController = require('../controllers/address.controller');
const validate = require('../middlewares/validate.middleware');
const { requireCustomer } = require('../middlewares/roles.middleware');

router.use(requireCustomer);

router.get('/', addressController.list);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid address id')],
  validate,
  addressController.getById
);

router.post(
  '/',
  [
    body('line1').trim().notEmpty().withMessage('line1 is required'),
    body('city').trim().notEmpty().withMessage('city is required'),
    body('postcode').trim().notEmpty().withMessage('postcode is required'),
    body('line2').optional().isString(),
    body('label').optional().isString().isLength({ max: 50 }),
    body('phone').optional().isString().isLength({ max: 20 }),
    body('houseNo').optional().isString().isLength({ max: 50 }),
    body('landmark').optional().isString().isLength({ max: 200 }),
    body('country').optional().isString().isLength({ max: 2 }),
    body('isDefault').optional(),
    body('lat').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
    body('lng').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
    body('formattedAddress').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  addressController.create
);

router.patch(
  '/:id',
  [
    param('id').isMongoId(),
    body('line1').optional().trim().notEmpty(),
    body('city').optional().trim().notEmpty(),
    body('postcode').optional().trim().notEmpty(),
    body('line2').optional().isString(),
    body('label').optional().isString(),
    body('phone').optional().isString().isLength({ max: 20 }),
    body('houseNo').optional().isString().isLength({ max: 50 }),
    body('landmark').optional().isString().isLength({ max: 200 }),
    body('country').optional().isString(),
    body('lat').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
    body('lng').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
    body('formattedAddress').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  addressController.update
);

router.delete(
  '/:id',
  [param('id').isMongoId()],
  validate,
  addressController.remove
);

router.patch(
  '/:id/default',
  [param('id').isMongoId()],
  validate,
  addressController.setDefault
);

module.exports = router;
