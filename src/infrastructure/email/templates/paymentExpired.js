'use strict';
const { render, p, kv, url } = require('./layout');
const { firstName, money } = require('./format');

module.exports = ({ name, order }) => ({
  subject: `Order ${order.orderNumber} was cancelled — payment window expired`,
  ...render({
    preheader: 'We did not receive payment in time.',
    heading: 'Payment window expired',
    blocks: [
      p(`Hi ${firstName(name)}, we did not receive payment for order ${order.orderNumber} in time, so it was cancelled automatically.`),
      kv([['Order number', order.orderNumber], ['Amount', money(order.total)]]),
      p('The items are back in stock. You have not been charged. You can place a new order whenever you are ready.'),
    ],
    cta: { label: 'Continue shopping', url: url('/shop') },
  }),
});
