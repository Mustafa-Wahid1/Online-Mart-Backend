'use strict';

const Wishlist = require('../models/Wishlist.model');
const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');
const AppError = require('../utils/AppError');
const { toString: moneyToString } = require('../utils/money');
const { getMainImageMap } = require('../utils/productImages');

const formatItem = (item, product, inventory) => ({
  id: item._id.toString(),
  productId: item.productId.toString(),
  addedAt: item.addedAt,
  product: product
    ? {
        id: product._id.toString(),
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        price: moneyToString(product.price),
        unit: product.unit,
        isActive: product.isActive,
        imageUrl: product.imageUrl || '',
      }
    : null,
  inventory: inventory
    ? {
        qtyOnHand: inventory.qtyOnHand,
        status: inventory.status,
      }
    : null,
});

const formatWishlist = async (wishlist) => {
  if (!wishlist || !wishlist.items || wishlist.items.length === 0) {
    return {
      id: wishlist ? wishlist._id.toString() : null,
      userId: wishlist ? wishlist.userId.toString() : null,
      items: [],
      itemCount: 0,
      updatedAt: wishlist ? wishlist.updatedAt : null,
    };
  }

  const productIds = wishlist.items.map((i) => i.productId);
  const [products, inventories, imageMap] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).lean(),
    Inventory.find({ productId: { $in: productIds } }).lean(),
    getMainImageMap(productIds),
  ]);

  const productMap = {};
  products.forEach((p) => {
    // Images live in the Image collection, not on Product
    p.imageUrl = imageMap.get(p._id.toString()) || '';
    productMap[p._id.toString()] = p;
  });
  const invMap = {};
  inventories.forEach((inv) => {
    invMap[inv.productId.toString()] = inv;
  });

  const items = wishlist.items
    .map((item) => {
      const product = productMap[item.productId.toString()];
      const inventory = invMap[item.productId.toString()];
      return formatItem(item, product, inventory);
    })
    .filter((item) => item.product && item.product.isActive);

  return {
    id: wishlist._id.toString(),
    userId: wishlist.userId.toString(),
    items,
    itemCount: items.length,
    updatedAt: wishlist.updatedAt,
  };
};

const getOrCreate = async (userId) => {
  let wishlist = await Wishlist.findOne({ userId });
  if (!wishlist) {
    wishlist = await Wishlist.create({ userId, items: [] });
  }
  return formatWishlist(wishlist);
};

const addItem = async (userId, { productId }) => {
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw new AppError('Product not found or inactive', 404);
  }

  let wishlist = await Wishlist.findOne({ userId });
  if (!wishlist) {
    wishlist = await Wishlist.create({ userId, items: [] });
  }

  const exists = wishlist.items.some((i) => i.productId.toString() === productId);
  if (exists) {
    throw new AppError('Product already in wishlist', 409);
  }

  wishlist.items.push({ productId, addedAt: new Date() });
  await wishlist.save();
  return formatWishlist(wishlist);
};

const removeItem = async (userId, itemId) => {
  const wishlist = await Wishlist.findOne({ userId });
  if (!wishlist) {
    throw new AppError('Wishlist not found', 404);
  }

  const initialLength = wishlist.items.length;
  wishlist.items = wishlist.items.filter((i) => i._id.toString() !== itemId);
  if (wishlist.items.length === initialLength) {
    throw new AppError('Wishlist item not found', 404);
  }

  await wishlist.save();
  return formatWishlist(wishlist);
};

const removeByProductId = async (userId, productId) => {
  const wishlist = await Wishlist.findOne({ userId });
  if (!wishlist) {
    throw new AppError('Wishlist not found', 404);
  }

  const initialLength = wishlist.items.length;
  wishlist.items = wishlist.items.filter((i) => i.productId.toString() !== productId);
  if (wishlist.items.length === initialLength) {
    throw new AppError('Product not in wishlist', 404);
  }

  await wishlist.save();
  return formatWishlist(wishlist);
};

const clear = async (userId) => {
  const wishlist = await Wishlist.findOne({ userId });
  if (!wishlist) {
    return { id: null, userId, items: [], itemCount: 0, updatedAt: null };
  }
  wishlist.items = [];
  await wishlist.save();
  return formatWishlist(wishlist);
};

const hasProduct = async (userId, productId) => {
  const wishlist = await Wishlist.findOne({ userId });
  if (!wishlist) return false;
  return wishlist.items.some((i) => i.productId.toString() === productId);
};

module.exports = {
  getOrCreate,
  addItem,
  removeItem,
  removeByProductId,
  clear,
  hasProduct,
};
