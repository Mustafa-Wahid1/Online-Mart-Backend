'use strict';

const Image = require('../models/Image.model');

/**
 * Main image URL for many products in ONE query.
 * Images live only in the Image collection (Product has no imageUrl field),
 * so cart, wishlist and orders must look them up here.
 * Returns Map<productId string, url of the oldest image>.
 */
const getMainImageMap = async (productIds) => {
  const ids = (productIds || []).filter(Boolean);
  const map = new Map();
  if (!ids.length) return map;

  const docs = await Image.find({ productId: { $in: ids } })
    .sort({ createdAt: 1, _id: 1 })
    .select('image productId')
    .lean();

  for (const d of docs) {
    const key = String(d.productId);
    if (d.image && !map.has(key)) map.set(key, d.image);
  }
  return map;
};

const getMainImageUrl = async (productId) => {
  const map = await getMainImageMap([productId]);
  return map.get(String(productId)) || '';
};

module.exports = { getMainImageMap, getMainImageUrl };
