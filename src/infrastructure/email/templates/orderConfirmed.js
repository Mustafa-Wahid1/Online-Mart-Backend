'use strict';
const { render, p, kv, url } = require('./layout');
const { firstName, fmtDate } = require('./format');
const { itemsBlock, totalsBlock, fulfilmentRows } = require('./orderCommon');

module.exports = ({ name, order, payment }) => ({
  subject: `Order ${order.orderNumber} confirmed — thank you!`,
  ...render({
    preheader: `We received your payment for order ${order.orderNumber}.`,
    heading: 'Order confirmed',
    blocks: [
      p(`Hi ${firstName(name)}, thanks for your order! We received your payment and your order is confirmed.`),
      kv([
        ['Order number', order.orderNumber],
        ['Payment reference', payment && payment.gatewayRef],
        ['Paid on', payment && payment.paidAt ? fmtDate(payment.paidAt) : fmtDate(new Date())],
        ...fulfilmentRows(order),
      ]),
      itemsBlock(order),
      totalsBlock(order),
    ],
    cta: { label: 'View order', url: url(`/orders/${order._id}`) },
  }),
});
