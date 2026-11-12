'use strict';
const { render, p, kv, url } = require('./layout');
const { money, fmtDate } = require('./format');
const { itemsBlock, fulfilmentRows } = require('./orderCommon');

module.exports = ({ customerName, order }) => ({
  subject: `New order ${order.orderNumber} (${money(order.total)})`,
  ...render({
    preheader: `${customerName} placed order ${order.orderNumber}.`,
    heading: 'New order placed',
    blocks: [
      p(`${customerName} placed a new order. It is awaiting payment.`),
      kv([
        ['Order number', order.orderNumber],
        ['Customer', customerName],
        ['Total', money(order.total)],
        ['Placed', fmtDate(order.createdAt || new Date())],
        ...fulfilmentRows(order),
      ]),
      itemsBlock(order),
    ],
    cta: { label: 'Open order', url: url(`/admin/orders/${order._id}`) },
    footerNote: 'Admin notification from OnlineMart.',
  }),
});
