'use strict';

const { money, fmtDate } = require('./format');
const { table, kv } = require('./layout');

const itemsBlock = (order) =>
  table(
    ['Item', 'Qty', 'Price'],
    (order.items || []).map((i) => [i.name, String(i.quantity), money(i.lineTotal)])
  );

const totalsBlock = (order) =>
  kv([
    ['Subtotal', money(order.subtotal)],
    Number(order.shippingFee) > 0 ? ['Delivery fee', money(order.shippingFee)] : null,
    ['Total', money(order.total)],
  ]);

const addressLine = (a) =>
  a
    ? [a.houseNo, a.line1, a.line2, a.city, a.postcode].filter((x) => x && String(x).trim()).join(', ')
    : '';

const fulfilmentRows = (order) =>
  order.deliveryType === 'PICKUP'
    ? [['Pickup', 'In store'], ['Pickup time', order.scheduledAt || order.pickupScheduledAt ? fmtDate(order.scheduledAt || order.pickupScheduledAt) : '']]
    : [
        ['Delivery to', addressLine(order.address)],
        ['Delivery time', order.scheduledAt ? fmtDate(order.scheduledAt) : ''],
      ];

module.exports = { itemsBlock, totalsBlock, fulfilmentRows, addressLine };
