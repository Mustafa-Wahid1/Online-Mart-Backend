'use strict';

const crypto = require('crypto');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');

/**
 * Mock payment gateway for local/dev testing.
 * Mock payment gateway interface:
 *   createIntent, cancelIntent, refund, capture, verifyWebhook,
 *   signEvent, verifyEvent, buildSucceededEvent
 */
class MockPaymentGateway {
  constructor() {
    this.secret = env.PAYMENT_WEBHOOK_SECRET || 'mock-webhook-secret-change-me';
  }

  /**
   * Create a mock payment intent.
   * amount is in major units (e.g. 12.50).
   */
  async createIntent({ amount, currency = 'USD', orderId, metadata = {} }) {
    const gatewayRef = `mock_pi_${crypto.randomBytes(12).toString('hex')}`;
    const clientSecret = `${gatewayRef}_secret_${crypto.randomBytes(8).toString('hex')}`;

    return {
      gatewayRef,
      amount: Number(amount),
      currency,
      status: 'requires_payment',
      clientSecret,
      approveUrl: null,
      metadata: { orderId: String(orderId), ...metadata },
    };
  }

  /**
   * Capture is a no-op for mock (payment is completed via mock-complete / webhook).
   */
  async capture(gatewayRef) {
    return {
      gatewayRef,
      captureId: `mock_cap_${crypto.randomBytes(8).toString('hex')}`,
      status: 'COMPLETED',
      amount: null,
      currency: 'USD',
      raw: { mock: true },
    };
  }

  /**
   * Cancel unpaid intent.
   */
  async cancelIntent(gatewayRef) {
    return {
      gatewayRef,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
    };
  }

  /**
   * Mock refund — always succeeds.
   */
  async refund({ gatewayRef, amount, reason = 'requested_by_customer', captureId }) {
    return {
      refundId: `mock_re_${crypto.randomBytes(10).toString('hex')}`,
      gatewayRef,
      captureId: captureId || null,
      amount: amount != null ? Number(amount) : null,
      status: 'succeeded',
      reason,
      refundedAt: new Date().toISOString(),
      raw: { mock: true },
    };
  }

  /**
   * Verify mock webhook signature (HMAC-SHA256 of JSON body).
   */
  async verifyWebhook(headers, body) {
    const signature =
      headers['x-webhook-signature'] ||
      headers['x-mock-signature'] ||
      headers['X-Webhook-Signature'];
    if (!signature) return false;
    return this.verifyEvent(body, signature);
  }

  /**
   * Sign an event payload (for mock-complete / tests).
   */
  signEvent(event) {
    const payload = typeof event === 'string' ? event : JSON.stringify(event);
    return crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  /**
   * Verify event signature.
   */
  verifyEvent(event, signature) {
    if (!signature) return false;
    const expected = this.signEvent(event);
    try {
      const a = Buffer.from(String(signature), 'utf8');
      const b = Buffer.from(expected, 'utf8');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * Build a payment.succeeded event for mock-complete flow.
   */
  buildSucceededEvent({ gatewayRef, amount, orderId, paymentId }) {
    return {
      id: `evt_mock_${crypto.randomBytes(10).toString('hex')}`,
      type: 'payment.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        gatewayRef: String(gatewayRef),
        paymentId: paymentId ? String(paymentId) : undefined,
        orderId: orderId ? String(orderId) : undefined,
        amount: Number(amount),
        currency: 'USD',
        status: 'succeeded',
      },
    };
  }
}

const gateway = new MockPaymentGateway();

module.exports = gateway;
module.exports.MockPaymentGateway = MockPaymentGateway;
