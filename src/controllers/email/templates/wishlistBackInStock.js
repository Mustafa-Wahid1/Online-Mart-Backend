'use strict';
const { render, p, kv, url } = require('./layout');
const { firstName } = require('./format');

module.exports = ({ name, productId, productName, qty }) => ({
  subject: `${productName} is back in stock`,
  ...render({
    preheader: `${productName} from your wishlist is available again.`,
    heading: 'Back in stock',
    blocks: [
      p(`Hi ${firstName(name)}, an item on your wishlist is available again:`),
      kv([['Product', productName], ['Available now', qty !== undefined ? `${qty} in stock` : '']]),
      p('Popular items can sell out quickly, so grab it while you can.'),
    ],
    cta: { label: 'View product', url: url(`/shop/${productId}`) },
    footerNote: 'You are receiving this because this product is on your OnlineMart wishlist.',
  }),
});
