'use strict';
const { render, p, kv, url } = require('./layout');
const { firstName, money } = require('./format');
const { addressLine } = require('./orderCommon');

module.exports = ({ name, order }) => ({
  subject: `Order ${order.orderNumber} was delivered`,
  ...render({
    preheader: 'Your order has been delivered.',
    heading: 'Order delivered',
    blocks: [
      p(`Hi ${firstName(name)}, your order ${order.orderNumber} has been delivered. We hope you enjoy it!`),
      kv([
        ['Order number', order.orderNumber],
        ['Total', money(order.total)],
        ['Delivered to', addressLine(order.address)],
      ]),
    ],
    cta: { label: 'View order', url: url(`/orders/${order._id}`) },
  }),
});
