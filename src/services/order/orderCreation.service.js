'use strict';

const mongoose = require('mongoose');
const Order = require('../../models/Order.model');
const Address = require('../../models/Address.model');
const Product = require('../../models/Product.model');
const Counter = require('../../models/Counter.model');
const cartService = require('../cart.service');
const inventoryService = require('../inventory.service');
const AppError = require('../../utils/AppError');
const { multiply, add, toString: moneyToString } = require('../../utils/money');
const { getMainImageMap, getMainImageUrl } = require('../../utils/productImages');
const { flushStockChanges, onOrderPlaced, onProcessingError } = require('../notification.triggers');

const PAYMENT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate order number: ORD-YYYY-######
 */
const generateOrderNumber = async (session) => {
  const year = new Date().getFullYear();
  const seq = await Counter.getNextSequence(`order:${year}`, session);
  const num = String(seq).padStart(6, '0');
  return `ORD-${year}-${num}`;
};

/**
 * Create order from cart — single transaction.
 *
 * 1. Validate delivery type
 * 2. Load cart (empty → 400)
 * 3. Sort items by productId
 * 4. For each: check stock, deduct, CONSUMED ledger, refresh status
 * 5. Price from product (never client). Subtotal + shipping (0) = total
 * 6. Create Order (PENDING, UNPAID, paymentExpiresAt = now + 5 min)
 * 7. Clear cart items
 * 8. Order number from Counter
 */
const createOrder = async (userId, body) => {
  const {
    deliveryType,
    addressId,
    address: inlineAddress,
    pickupScheduledAt,
  } = body;

  if (!deliveryType || !['DELIVERY', 'PICKUP'].includes(deliveryType)) {
    throw new AppError('deliveryType must be DELIVERY or PICKUP', 400);
  }

  // Validate delivery / pickup requirements
  let orderAddress = null;
  let pickupAt = null;

  if (deliveryType === 'DELIVERY') {
    const hasAddressId = Boolean(addressId);
    const hasInline = Boolean(inlineAddress && inlineAddress.line1);
    if (hasAddressId === hasInline) {
      // both or neither
      throw new AppError(
        'DELIVERY requires exactly one of addressId or inline address',
        400
      );
    }
    if (hasAddressId) {
      const addr = await Address.findOne({ _id: addressId, userId });
      if (!addr) throw new AppError('Address not found', 404);
      orderAddress = {
        line1: addr.line1,
        line2: addr.line2 || '',
        city: addr.city,
        postcode: addr.postcode,
        country: addr.country || 'GB',
        label: addr.label || '',
        phone: addr.phone || '',
        houseNo: addr.houseNo || '',
        landmark: addr.landmark || '',
        lat: addr.lat != null ? addr.lat : null,
        lng: addr.lng != null ? addr.lng : null,
        formattedAddress: addr.formattedAddress || '',
      };
    } else {
      if (!inlineAddress.city || !inlineAddress.postcode) {
        throw new AppError('Inline address requires line1, city, and postcode', 400);
      }
      orderAddress = {
        line1: inlineAddress.line1,
        line2: inlineAddress.line2 || '',
        city: inlineAddress.city,
        postcode: inlineAddress.postcode,
        country: inlineAddress.country || 'GB',
        label: inlineAddress.label || '',
        phone: inlineAddress.phone || '',
        houseNo: inlineAddress.houseNo || '',
        landmark: inlineAddress.landmark || '',
        lat: inlineAddress.lat != null ? Number(inlineAddress.lat) : null,
        lng: inlineAddress.lng != null ? Number(inlineAddress.lng) : null,
        formattedAddress: inlineAddress.formattedAddress || '',
      };
    }
  } else {
    // PICKUP
    if (!pickupScheduledAt) {
      throw new AppError('pickupScheduledAt is required for PICKUP orders', 400);
    }
    pickupAt = new Date(pickupScheduledAt);
    if (Number.isNaN(pickupAt.getTime()) || pickupAt <= new Date()) {
      throw new AppError('pickupScheduledAt must be a future date', 400);
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const cart = await cartService.getRawCart(userId);
    if (!cart || !cart.items || cart.items.length === 0) {
      throw new AppError('Cart is empty. Cannot create order.', 400);
    }

    // Sort items by productId for deterministic locking order
    const sortedItems = [...cart.items].sort((a, b) =>
      a.productId.toString().localeCompare(b.productId.toString())
    );

    const orderItems = [];
    let subtotal = 0;

    for (const cartItem of sortedItems) {
      const product = await Product.findById(cartItem.productId).session(session);
      if (!product || !product.isActive) {
        throw new AppError(`Product not found or inactive: ${cartItem.productId}`, 404);
      }

      // Consume stock + ledger
      await inventoryService.consumeInTx({
        productId: product._id,
        quantity: cartItem.quantity,
        orderId: null, // set after order created — see below
        session,
      });

      const unitPrice = Number(product.price);
      const lineTotal = Number(multiply(unitPrice, cartItem.quantity));
      subtotal = Number(add(subtotal, lineTotal));

      orderItems.push({
        productId: product._id,
        name: product.name,
        sku: product.sku,
        quantity: cartItem.quantity,
        unitPrice,
        lineTotal,
        imageUrl: await getMainImageUrl(product._id),
      });
    }

    const shippingFee = 0;
    const total = Number(add(subtotal, shippingFee));
    const orderNumber = await generateOrderNumber(session);
    const now = new Date();

    const [order] = await Order.create(
      [
        {
          orderNumber,
          userId,
          items: orderItems,
          deliveryType,
          address: orderAddress,
          pickupScheduledAt: pickupAt,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          subtotal,
          shippingFee,
          total,
          paymentExpiresAt: new Date(now.getTime() + PAYMENT_WINDOW_MS),
        },
      ],
      { session }
    );

    // Patch CONSUMED ledger entries with real orderId
    // consumeInTx was called with orderId: null; update them now
    const InventoryTransaction = require('../../models/InventoryTransaction.model');
    await InventoryTransaction.updateMany(
      {
        type: 'CONSUMED',
        referenceType: 'ORDER',
        referenceId: null,
        productId: { $in: orderItems.map((i) => i.productId) },
        createdAt: { $gte: new Date(now.getTime() - 5000) },
      },
      { $set: { referenceId: order._id } },
      { session }
    );

    // Better approach: re-run consume with order id would double-deduct.
    // Instead fix consumeInTx to accept pending orderId after create.
    // For cleanliness, update the null referenceIds that match this session's products.
    // Already done above.

    await cartService.clearInTx(userId, session);

    await session.commitTransaction();

    return await formatOrder(order);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Improved create that passes orderId to ledger correctly.
 * Refactor: create order first with items, then consume with orderId.
 * Stock check happens before deduct.
 */
const createOrderV2 = async (userId, body) => {
  const {
    deliveryType,
    addressId,
    address: inlineAddress,
    pickupScheduledAt,
  } = body;

  if (!deliveryType || !['DELIVERY', 'PICKUP'].includes(deliveryType)) {
    throw new AppError('deliveryType must be DELIVERY or PICKUP', 400);
  }

  let orderAddress = null;
  let pickupAt = null;

  if (deliveryType === 'DELIVERY') {
    const hasAddressId = Boolean(addressId);
    const hasInline = Boolean(inlineAddress && inlineAddress.line1);
    if (hasAddressId === hasInline) {
      throw new AppError(
        'DELIVERY requires exactly one of addressId or inline address',
        400
      );
    }
    if (hasAddressId) {
      const addr = await Address.findOne({ _id: addressId, userId });
      if (!addr) throw new AppError('Address not found', 404);
      orderAddress = {
        line1: addr.line1,
        line2: addr.line2 || '',
        city: addr.city,
        postcode: addr.postcode,
        country: addr.country || 'GB',
        label: addr.label || '',
        phone: addr.phone || '',
        houseNo: addr.houseNo || '',
        landmark: addr.landmark || '',
        lat: addr.lat != null ? addr.lat : null,
        lng: addr.lng != null ? addr.lng : null,
        formattedAddress: addr.formattedAddress || '',
      };
    } else {
      if (!inlineAddress.city || !inlineAddress.postcode) {
        throw new AppError('Inline address requires line1, city, and postcode', 400);
      }
      orderAddress = {
        line1: inlineAddress.line1,
        line2: inlineAddress.line2 || '',
        city: inlineAddress.city,
        postcode: inlineAddress.postcode,
        country: inlineAddress.country || 'GB',
        label: inlineAddress.label || '',
        phone: inlineAddress.phone || '',
        houseNo: inlineAddress.houseNo || '',
        landmark: inlineAddress.landmark || '',
        lat: inlineAddress.lat != null ? Number(inlineAddress.lat) : null,
        lng: inlineAddress.lng != null ? Number(inlineAddress.lng) : null,
        formattedAddress: inlineAddress.formattedAddress || '',
      };
    }
  } else {
    if (!pickupScheduledAt) {
      throw new AppError('pickupScheduledAt is required for PICKUP orders', 400);
    }
    pickupAt = new Date(pickupScheduledAt);
    if (Number.isNaN(pickupAt.getTime()) || pickupAt <= new Date()) {
      throw new AppError('pickupScheduledAt must be a future date', 400);
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const cart = await cartService.getRawCart(userId);
    if (!cart || !cart.items || cart.items.length === 0) {
      throw new AppError('Cart is empty. Cannot create order.', 400);
    }

    const sortedItems = [...cart.items].sort((a, b) =>
      a.productId.toString().localeCompare(b.productId.toString())
    );

    // Pre-validate all products and stock before mutating
    const validated = [];
    for (const cartItem of sortedItems) {
      const product = await Product.findById(cartItem.productId).session(session);
      if (!product || !product.isActive) {
        throw new AppError('Product not found', 404);
      }
      const Inventory = require('../../models/Inventory.model');
      const inv = await Inventory.findOne({ productId: product._id }).session(session);
      if (!inv || inv.qtyOnHand < cartItem.quantity) {
        const available = inv ? inv.qtyOnHand : 0;
        throw new AppError(
          `Not enough stock. Requested: ${cartItem.quantity}, Available: ${available}.`,
          400
        );
      }
      validated.push({ cartItem, product, inv });
    }

    const orderItems = [];
    let subtotal = 0;
    for (const { cartItem, product } of validated) {
      const unitPrice = Number(product.price);
      const lineTotal = Number(multiply(unitPrice, cartItem.quantity));
      subtotal = Number(add(subtotal, lineTotal));
      orderItems.push({
        productId: product._id,
        name: product.name,
        sku: product.sku,
        quantity: cartItem.quantity,
        unitPrice,
        lineTotal,
        imageUrl: await getMainImageUrl(product._id),
      });
    }

    const shippingFee = 0;
    const total = Number(add(subtotal, shippingFee));
    const orderNumber = await generateOrderNumber(session);
    const now = new Date();

    const [order] = await Order.create(
      [
        {
          orderNumber,
          userId,
          items: orderItems,
          deliveryType,
          address: orderAddress,
          pickupScheduledAt: pickupAt,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          subtotal,
          shippingFee,
          total,
          paymentExpiresAt: new Date(now.getTime() + PAYMENT_WINDOW_MS),
        },
      ],
      { session }
    );

    // Now consume stock with real orderId
    for (const { cartItem, product } of validated) {
      await inventoryService.consumeInTx({
        productId: product._id,
        quantity: cartItem.quantity,
        orderId: order._id,
        session,
      });
    }

    await cartService.clearInTx(userId, session);
    await session.commitTransaction();

    await flushStockChanges(session);
    await onOrderPlaced(order);

    return await formatOrder(order);
  } catch (err) {
    await session.abortTransaction();
    if (!err.isOperational && err.code !== 11000) {
      await onProcessingError({ scope: 'order', entityId: String(userId), message: err.message });
    }
    throw err;
  } finally {
    session.endSession();
  }
};

const formatOrder = async (order) => {
  const obj = order.toObject ? order.toObject() : { ...order };
  const items = obj.items || [];

  // Enrich imageUrl from Product for old orders that don't have it
  const missingIds = items
    .filter((i) => !i.imageUrl)
    .map((i) => i.productId);
  let imageMap = {};
  if (missingIds.length) {
    // Images live in the Image collection (Product has no imageUrl)
    const map = await getMainImageMap(missingIds);
    map.forEach((url, id) => { imageMap[id] = url; });
  }

  // Legacy / broken orders: DELIVERY order saved without an address snapshot.
  // Fall back to the customer's default (or latest) saved address so it still shows.
  let address = obj.address || null;
  if (obj.deliveryType === 'DELIVERY' && (!address || !address.line1)) {
    const a = await Address.findOne({ userId: obj.userId })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();
    if (a) {
      address = {
        line1: a.line1,
        line2: a.line2 || '',
        city: a.city,
        postcode: a.postcode,
        country: a.country || 'GB',
        label: a.label || '',
        phone: a.phone || '',
        houseNo: a.houseNo || '',
        landmark: a.landmark || '',
        lat: a.lat != null ? a.lat : null,
        lng: a.lng != null ? a.lng : null,
        formattedAddress: a.formattedAddress || '',
      };
    }
  }

  return {
    id: obj._id.toString(),
    orderNumber: obj.orderNumber,
    userId: obj.userId.toString(),
    items: items.map((i) => ({
      productId: i.productId.toString(),
      name: i.name,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: moneyToString(i.unitPrice),
      lineTotal: moneyToString(i.lineTotal),
      imageUrl: i.imageUrl || imageMap[i.productId.toString()] || '',
    })),
    deliveryType: obj.deliveryType,
    address,
    pickupScheduledAt: obj.pickupScheduledAt || null,
    status: obj.status,
    paymentStatus: obj.paymentStatus,
    subtotal: moneyToString(obj.subtotal),
    shippingFee: moneyToString(obj.shippingFee),
    total: moneyToString(obj.total),
    paymentExpiresAt: obj.paymentExpiresAt,
    cancelledAt: obj.cancelledAt,
    cancelReason: obj.cancelReason,
    cancelledBy: obj.cancelledBy,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
};

module.exports = {
  createOrder: createOrderV2,
  formatOrder,
  generateOrderNumber,
};