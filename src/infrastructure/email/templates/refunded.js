'use strict';
const { render, p, kv, url } = require('./layout');
const { firstName, money, fmtDate } = require('./format');

module.exports = ({ name, order }) => ({
  subject: `Refund issued for order ${order.orderNumber}`,
  ...render({
    preheader: `We refunded ${money(order.total)}.`,
    heading: 'Refund completed',
    blocks: [
      p(`Hi ${firstName(name)}, your refund for order ${order.orderNumber} has been issued.`),
      kv([
        ['Order number', order.orderNumber],
        ['Refund amount', money(order.total)],
        ['Issued on', fmtDate(new Date())],
      ]),
      p('Depending on your bank, it can take a few days to appear on your statement.'),
    ],
    cta: { label: 'View order', url: url(`/orders/${order._id}`) },
  }),
});
