'use strict';
const { render, p, kv, url } = require('./layout');
const { firstName, money } = require('./format');

module.exports = ({ name, order }) => ({
  subject: `Refund started for order ${order.orderNumber}`,
  ...render({
    preheader: `Your refund of ${money(order.total)} is being processed.`,
    heading: 'Refund started',
    blocks: [
      p(`Hi ${firstName(name)}, order ${order.orderNumber} was cancelled and your refund is being processed.`),
      kv([
        ['Order number', order.orderNumber],
        ['Refund amount', money(order.total)],
        ['Cancellation reason', order.cancelReason],
      ]),
      p('We will email you again as soon as the refund has been issued.'),
    ],
    cta: { label: 'View order', url: url(`/orders/${order._id}`) },
  }),
});
