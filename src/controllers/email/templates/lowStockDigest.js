'use strict';
const { render, p, callout, table, url } = require('./layout');
const { fmtDate } = require('./format');

const MAX_ROWS = 100;

module.exports = ({ items }) => {
  const out = items.filter((i) => i.status === 'OUT_OF_STOCK').length;
  const low = items.length - out;
  const shown = items.slice(0, MAX_ROWS);
  return {
    subject: `Daily stock report: ${out} out of stock, ${low} low`,
    ...render({
      preheader: `${items.length} products need attention.`,
      heading: 'Daily low-stock digest',
      blocks: [
        p(`${items.length} product${items.length === 1 ? '' : 's'} need restocking as of ${fmtDate(new Date())}.`),
        out ? callout(`${out} out of stock`, 'danger') : null,
        table(
          ['Product', 'On hand', 'Threshold'],
          shown.map((i) => [`${i.name}${i.status === 'OUT_OF_STOCK' ? ' (out of stock)' : ''}`, String(i.qtyOnHand), String(i.lowStockThreshold)])
        ),
        items.length > shown.length ? p(`…and ${items.length - shown.length} more. Open inventory to see all.`) : null,
      ].filter(Boolean),
      cta: { label: 'Open inventory', url: url('/admin/inventory') },
      footerNote: 'Admin notification from OnlineMart. Sent once a day when something needs attention.',
    }),
  };
};
