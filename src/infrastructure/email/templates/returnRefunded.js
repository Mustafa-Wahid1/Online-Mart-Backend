'use strict';

const { render, p, kv, url } = require('./layout');
const { firstName, money, fmtDate } = require('./format');

/** Sent when a return is completed and the customer has been refunded. */
module.exports = ({ name, ret }) => ({
  subject: `Refund issued for your return (order ${ret.orderNumber})`,
  ...render({
    preheader: `We refunded ${money(ret.refundAmount)} for your return.`,
    heading: 'Return refunded',
    blocks: [
      p(`Hi ${firstName(name)}, your return for order ${ret.orderNumber} is complete and your refund has been issued.`),
      kv([
        ['Order number', ret.orderNumber],
        ['Refund amount', money(ret.refundAmount)],
        ['Issued on', fmtDate(new Date())],
      ]),
      p('Depending on your bank, it can take a few days to appear on your statement.'),
    ],
    cta: { label: 'View your returns', url: url('/returns') },
  }),
});
