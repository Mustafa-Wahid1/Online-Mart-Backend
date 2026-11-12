'use strict';
const { render, p, kv, url } = require('./layout');
const { firstName, fmtDate } = require('./format');

module.exports = ({ name, order }) => ({
  subject: `Order ${order.orderNumber} is ready for pickup`,
  ...render({
    preheader: 'Your order is ready to collect.',
    heading: 'Ready for pickup',
    blocks: [
      p(`Hi ${firstName(name)}, good news — order ${order.orderNumber} is packed and ready for you to collect.`),
      kv([
        ['Order number', order.orderNumber],
        ['Pickup time', order.pickupScheduledAt ? fmtDate(order.pickupScheduledAt) : ''],
      ]),
      p('Please bring your order number when you arrive.'),
    ],
    cta: { label: 'View order', url: url(`/orders/${order._id}`) },
  }),
});
