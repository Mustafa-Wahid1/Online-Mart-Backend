'use strict';
const { render, p, callout, kv, url } = require('./layout');
const { money } = require('./format');

module.exports = ({ customerName, order }) => ({
  subject: `ACTION REQUIRED: refund needed for order ${order.orderNumber}`,
  ...render({
    preheader: `${customerName} cancelled a paid order.`,
    heading: 'Paid order cancelled — refund needed',
    blocks: [
      callout('Action required: a customer cancelled a paid order and a refund is pending.', 'danger'),
      kv([
        ['Order number', order.orderNumber],
        ['Customer', customerName],
        ['Refund amount', money(order.total)],
        ['Reason', order.cancelReason],
      ]),
      p('The refund is retried automatically. Open the order to check its status.'),
    ],
    cta: { label: 'Open order', url: url(`/admin/orders/${order._id}`) },
    footerNote: 'Admin notification from OnlineMart.',
  }),
});
