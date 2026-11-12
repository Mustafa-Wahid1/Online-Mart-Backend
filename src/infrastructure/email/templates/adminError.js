'use strict';
const { render, p, callout, kv, url } = require('./layout');
const { fmtDate } = require('./format');

module.exports = ({ title, orderRef, orderId, message }) => ({
  subject: `[Error] ${title}${orderRef ? ` — ${orderRef}` : ''}`,
  ...render({
    preheader: String(message || '').slice(0, 90),
    heading: title,
    blocks: [
      callout('A processing error needs your attention.', 'danger'),
      kv([['Order', orderRef], ['Error', message], ['Time', fmtDate(new Date())]]),
      p('No customer data or secrets are included in this message.'),
    ],
    cta: orderId ? { label: 'Open order', url: url(`/admin/orders/${orderId}`) } : null,
    footerNote: 'Admin notification from OnlineMart.',
  }),
});
