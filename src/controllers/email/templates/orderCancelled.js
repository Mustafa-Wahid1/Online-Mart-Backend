'use strict';
const { render, p, kv, url } = require('./layout');
const { firstName, money } = require('./format');

module.exports = ({ name, order, byAdmin }) => ({
  subject: `Order ${order.orderNumber} was cancelled`,
  ...render({
    preheader: `Order ${order.orderNumber} has been cancelled.`,
    heading: 'Order cancelled',
    blocks: [
      p(`Hi ${firstName(name)}, order ${order.orderNumber} ${byAdmin ? 'was cancelled by our team' : 'has been cancelled as you requested'}.`),
      kv([
        ['Order number', order.orderNumber],
        ['Amount', money(order.total)],
        ['Reason', order.cancelReason],
      ]),
      p('You have not been charged for this order.'),
    ],
    cta: { label: 'View order', url: url(`/orders/${order._id}`) },
  }),
});
