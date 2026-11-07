'use strict';

/**
 * Payment gateway selector.
 * Currently only mock is supported (card-style test payments).
 * EasyPaisa / JazzCash can be added later when merchant credentials are available.
 */
const env = require('../../config/env');

const mode = env.PAYMENT_GATEWAY;

const gateway = require('./mockPayment.gateway');

module.exports = gateway;
module.exports.mode = mode;
