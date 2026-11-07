'use strict';
const { render, p, callout, kv, url } = require('./layout');
const { firstName, fmtDate, money } = require('./format');

module.exports = ({ name, order, canRetry }) => ({
  subject: `Payment failed for order ${order.orderNumber}`,
  ...render({
    preheader: 'Your payment did not go through.',
    heading: 'Payment failed',
    blocks: [
      p(`Hi ${firstName(name)}, your payment for order ${order.orderNumber} did not go through. You have not been charged.`),
      kv([['Order number', order.orderNumber], ['Amount', money(order.total)]]),
      canRetry
        ? callout(
            order.paymentExpiresAt
              ? `Please try again before ${fmtDate(order.paymentExpiresAt)}, or the order will be cancelled automatically.`
              : 'Please try again soon, or the order may be cancelled automatically.',
            'warn'
          )
        : p('This order can no longer be paid. You can place a new order any time.'),
    ],
    cta: canRetry ? { label: 'Try again', url: url(`/checkout/payment/${order._id}`) } : null,
  }),
});
