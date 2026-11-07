'use strict';

const Cart = require('../models/Cart.model');
const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');
const AppError = require('../utils/AppError');
const { toString: moneyToString, multiply, add } = require('../utils/money');
const { getMainImageMap } = require('../utils/productImages');

const formatCartItem = (item, product, inventory) => {
  const unitPrice = product ? Number(product.price) : 0;
  const lineTotal = product ? Number(multiply(unitPrice, item.quantity)) : 0;
  return {
    id: item._id.toString(),
    productId: item.productId.toString(),
    quantity: item.quantity,
    product: product
      ? {
          id: product._id.toString(),
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          price: moneyToString(product.price),
          unit: product.unit,
          minimumOrderQuantity: product.minimumOrderQuantity,
          maximumOrderQuantity: product.maximumOrderQuantity,
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
    unitPrice: moneyToString(unitPrice),
    lineTotal: moneyToString(lineTotal),
  };
};

const formatCart = async (cart) => {
  if (!cart || !cart.items || cart.items.length === 0) {
    return {
      id: cart ? cart._id.toString() : null,
      userId: cart ? cart.userId.toString() : null,
      items: [],
      itemCount: 0,
      subtotal: moneyToString(0),
      updatedAt: cart ? cart.updatedAt : null,
    };
  }

  const productIds = cart.items.map((i) => i.productId);
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

  let subtotal = 0;
  const items = cart.items.map((item) => {
    const product = productMap[item.productId.toString()];
    const inventory = invMap[item.productId.toString()];
    const formatted = formatCartItem(item, product, inventory);
    if (product) {
      subtotal = Number(add(subtotal, formatted.lineTotal));
    }
    return formatted;
  });

  return {
    id: cart._id.toString(),
    userId: cart.userId.toString(),
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: moneyToString(subtotal),
    updatedAt: cart.updatedAt,
  };
};

/**
 * Get or create cart for user.
 */
const getOrCreate = async (userId) => {
  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = await Cart.create({ userId, items: [] });
  }
  return formatCart(cart);
};

/**
 * Validate product for cart operations.
 * Inactive → 404
 * OUT_OF_STOCK → 400
 */
const loadProductAndInventory = async (productId) => {
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw new AppError('Product not found', 404);
  }

  const inventory = await Inventory.findOne({ productId });
  if (!inventory || inventory.status === 'OUT_OF_STOCK' || inventory.qtyOnHand <= 0) {
    throw new AppError('Product is out of stock', 400);
  }

  return { product, inventory };
};

/**
 * Max allowed qty for a product = min(stock, maximumOrderQuantity)
 */
const maxAllowed = (product, inventory) =>
  Math.min(inventory.qtyOnHand, product.maximumOrderQuantity);

/**
 * Add item to cart.
 * First add must be ≥ minimumOrderQuantity.
 * Total qty ≤ min(stock, maxOrderQty) else 400 with "Only N units available".
 */
const addItem = async (userId, { productId, quantity }) => {
  const qty = Math.floor(Number(quantity));
  if (!qty || qty < 1) {
    throw new AppError('quantity must be a positive integer', 400);
  }

  const { product, inventory } = await loadProductAndInventory(productId);
  const allowed = maxAllowed(product, inventory);

  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = await Cart.create({ userId, items: [] });
  }

  const existing = cart.items.find(
    (i) => i.productId.toString() === productId.toString()
  );

  if (existing) {
    const newQty = existing.quantity + qty;
    if (newQty > allowed) {
      throw new AppError(`Only ${allowed} units available`, 400);
    }
    existing.quantity = newQty;
  } else {
    // First add ≥ minimumOrderQuantity
    if (qty < product.minimumOrderQuantity) {
      throw new AppError(
        `Minimum order quantity is ${product.minimumOrderQuantity}`,
        400
      );
    }
    if (qty > allowed) {
      throw new AppError(`Only ${allowed} units available`, 400);
    }
    cart.items.push({ productId: product._id, quantity: qty });
  }

  await cart.save();
  return formatCart(cart);
};

/**
 * Update cart item quantity.
 */
const updateItem = async (userId, itemId, { quantity }) => {
  const qty = Math.floor(Number(quantity));
  if (!qty || qty < 1) {
    throw new AppError('quantity must be a positive integer', 400);
  }

  const cart = await Cart.findOne({ userId });
  if (!cart) throw new AppError('Cart not found', 404);

  const item = cart.items.id(itemId);
  if (!item) throw new AppError('Cart item not found', 404);

  const { product, inventory } = await loadProductAndInventory(item.productId);
  const allowed = maxAllowed(product, inventory);

  if (qty < product.minimumOrderQuantity) {
    throw new AppError(
      `Minimum order quantity is ${product.minimumOrderQuantity}`,
      400
    );
  }
  if (qty > allowed) {
    throw new AppError(`Only ${allowed} units available`, 400);
  }

  item.quantity = qty;
  await cart.save();
  return formatCart(cart);
};

/**
 * Remove a single cart item.
 */
const removeItem = async (userId, itemId) => {
  const cart = await Cart.findOne({ userId });
  if (!cart) throw new AppError('Cart not found', 404);

  const item = cart.items.id(itemId);
  if (!item) throw new AppError('Cart item not found', 404);

  item.deleteOne();
  await cart.save();
  return formatCart(cart);
};

/**
 * Clear entire cart.
 */
const clear = async (userId) => {
  const cart = await Cart.findOne({ userId });
  if (!cart) {
    return {
      id: null,
      userId,
      items: [],
      itemCount: 0,
      subtotal: moneyToString(0),
      updatedAt: null,
    };
  }
  cart.items = [];
  await cart.save();
  return formatCart(cart);
};

/**
 * Internal: get raw cart document (for order creation).
 */
const getRawCart = async (userId) => {
  return Cart.findOne({ userId });
};

/**
 * Internal: clear cart items inside a transaction session.
 */
const clearInTx = async (userId, session) => {
  await Cart.findOneAndUpdate(
    { userId },
    { $set: { items: [] } },
    { session }
  );
};

module.exports = {
  getOrCreate,
  addItem,
  updateItem,
  removeItem,
  clear,
  getRawCart,
  clearInTx,
  formatCart,
};
