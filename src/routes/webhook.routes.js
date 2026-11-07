'use strict';

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

/**
 * Mock payment webhook — public (signature verified in service).
 * POST /v1/webhooks/payments/mock
 */
router.post('/payments/mock', paymentController.mockWebhook);

module.exports = router;
