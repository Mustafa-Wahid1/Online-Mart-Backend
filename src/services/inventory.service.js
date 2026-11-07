'use strict';

const mongoose = require('mongoose');
const Inventory = require('../models/Inventory.model');
const InventoryTransaction = require('../models/InventoryTransaction.model');
const Product = require('../models/Product.model');
const AppError = require('../utils/AppError');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { getMainImageMap } = require('../utils/productImages');
const { queueStockChange, flushStockChanges, describeStockChange, onStockChanges } = require('./notification.triggers');

const ADJUSTMENT_TYPES = {
  DAMAGE: 'ADJUSTMENT_DAMAGE',
  RETURN_TO_SUPPLIER: 'ADJUSTMENT_RETURN_TO_SUPPLIER',
  RESTOCK: 'ADJUSTMENT_RESTOCK',
  OTHER: 'ADJUSTMENT_OTHER',
  RECEIVED: 'RECEIVED',
};

const formatInventory = (inv, product = null) => {
  const obj = inv.toObject ? inv.toObject() : { ...inv };
  const result = {
    id: obj._id.toString(),
    productId: obj.productId.toString(),
    qtyOnHand: obj.qtyOnHand,
    lowStockThreshold: obj.lowStockThreshold,
    status: obj.status,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
  if (product) {
    result.product = {
      id: product._id.toString(),
      name: product.name,
      sku: product.sku,
      isActive: product.isActive,
      imageUrl: product.imageUrl || '',
    };
  }
  return result;
};

const formatTransaction = (tx) => {
  const obj = tx.toObject ? tx.toObject() : { ...tx };
  return {
    id: obj._id.toString(),
    productId: obj.productId.toString(),
    inventoryId: obj.inventoryId.toString(),
    type: obj.type,
    quantity: obj.quantity,
    qtyBefore: obj.qtyBefore,
    qtyAfter: obj.qtyAfter,
    reason: obj.reason || '',
    referenceType: obj.referenceType,
    referenceId: obj.referenceId ? obj.referenceId.toString() : null,
    performedBy: obj.performedBy ? obj.performedBy.toString() : null,
    createdAt: obj.createdAt,
  };
};

/**
 * List inventory with optional filters and product join.
 */
const list = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) {
    filter.status = query.status;
  }
  if (query.productId) {
    filter.productId = query.productId;
  }

  const [data, total] = await Promise.all([
    Inventory.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Inventory.countDocuments(filter),
  ]);

  const productIds = data.map((i) => i.productId);
  const [products, imageMap] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).select('name sku isActive').lean(),
    getMainImageMap(productIds), // images live in the Image collection
  ]);
  const productMap = {};
  products.forEach((p) => {
    p.imageUrl = imageMap.get(p._id.toString()) || '';
    productMap[p._id.toString()] = p;
  });

  return {
    data: data.map((inv) =>
      formatInventory(inv, productMap[inv.productId.toString()] || null)
    ),
    meta: buildMeta(total, page, limit),
  };
};

const getById = async (id) => {
  const inv = await Inventory.findById(id).lean();
  if (!inv) throw new AppError('Inventory not found', 404);
  const product = await Product.findById(inv.productId).select('name sku isActive').lean();
  return formatInventory(inv, product);
};

const getByProductId = async (productId) => {
  const inv = await Inventory.findOne({ productId }).lean();
  if (!inv) throw new AppError('Inventory not found', 404);
  const product = await Product.findById(productId).select('name sku isActive').lean();
  return formatInventory(inv, product);
};

/**
 * Create or ensure inventory record for a product (admin).
 * If already exists → 409.
 */
const create = async ({ productId, qtyOnHand = 0, lowStockThreshold = 10 }, performedBy = null) => {
  const product = await Product.findById(productId);
  if (!product) throw new AppError('Product not found', 404);

  const existing = await Inventory.findOne({ productId });
  if (existing) {
    throw new AppError('Inventory already exists for this product', 409);
  }

  const qty = Math.max(0, Math.floor(Number(qtyOnHand)));
  const threshold = Math.max(0, Math.floor(Number(lowStockThreshold)));

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const inventory = new Inventory({
      productId,
      qtyOnHand: qty,
      lowStockThreshold: threshold,
    });
    inventory.recalculateStatus();
    await inventory.save({ session });

    if (qty > 0) {
      await InventoryTransaction.create(
        [
          {
            productId,
            inventoryId: inventory._id,
            type: 'RECEIVED',
            quantity: qty,
            qtyBefore: 0,
            qtyAfter: qty,
            reason: 'Initial stock',
            referenceType: 'MANUAL',
            performedBy,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
    return formatInventory(inventory, product.toObject());
  } catch (err) {
    await session.abortTransaction();
    if (err.code === 11000) {
      throw new AppError('Inventory already exists for this product', 409);
    }
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Adjust inventory.
 * Rules:
 * - quantity ≠ 0
 * - DAMAGE / RETURN_TO_SUPPLIER → only negative
 * - RESTOCK / RECEIVED → only positive
 * - Result qty < 0 → 400
 * - Writes ledger entry in same transaction
 */
const adjust = async (
  {
    productId,
    inventoryId,
    type,
    quantity,
    reason,
    note,
  },
  performedBy = null
) => {
  // Frontend sends "reason" as the adjustment type (RECEIVED, ADJUSTMENT, DAMAGE, ...)
  const rawType = type || reason || '';
  const qty = Number(quantity);
  if (!qty || qty === 0 || Number.isNaN(qty)) {
    throw new AppError('quantity must be a non-zero number', 400);
  }
  if (!Number.isInteger(qty)) {
    throw new AppError('quantity must be an integer', 400);
  }

  const normalizedType = String(rawType).toUpperCase();
  const typeMap = {
    DAMAGE: 'ADJUSTMENT_DAMAGE',
    RETURN_TO_SUPPLIER: 'ADJUSTMENT_RETURN_TO_SUPPLIER',
    RESTOCK: 'ADJUSTMENT_RESTOCK',
    OTHER: 'ADJUSTMENT_OTHER',
    ADJUSTMENT: 'ADJUSTMENT_OTHER',          // frontend "ADJUSTMENT"
    RECEIVED: 'RECEIVED',
    ADJUSTMENT_DAMAGE: 'ADJUSTMENT_DAMAGE',
    ADJUSTMENT_RETURN_TO_SUPPLIER: 'ADJUSTMENT_RETURN_TO_SUPPLIER',
    ADJUSTMENT_RESTOCK: 'ADJUSTMENT_RESTOCK',
    ADJUSTMENT_OTHER: 'ADJUSTMENT_OTHER',
  };

  const ledgerType = typeMap[normalizedType];
  if (!ledgerType) {
    throw new AppError(
      'Invalid adjustment type. Allowed: DAMAGE, RETURN_TO_SUPPLIER, RESTOCK, OTHER, RECEIVED',
      400
    );
  }

  // Sign rules
  if (
    (ledgerType === 'ADJUSTMENT_DAMAGE' || ledgerType === 'ADJUSTMENT_RETURN_TO_SUPPLIER') &&
    qty > 0
  ) {
    throw new AppError('DAMAGE and RETURN_TO_SUPPLIER adjustments must be negative', 400);
  }
  if ((ledgerType === 'ADJUSTMENT_RESTOCK' || ledgerType === 'RECEIVED') && qty < 0) {
    throw new AppError('RESTOCK and RECEIVED adjustments must be positive', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let inventory;
    if (inventoryId) {
      inventory = await Inventory.findById(inventoryId).session(session);
    } else if (productId) {
      inventory = await Inventory.findOne({ productId }).session(session);
    } else {
      throw new AppError('productId or inventoryId is required', 400);
    }

    if (!inventory) throw new AppError('Inventory not found', 404);

    const qtyBefore = inventory.qtyOnHand;
    const qtyAfter = qtyBefore + qty;

    if (qtyAfter < 0) {
      throw new AppError(
        `Insufficient stock. Current: ${qtyBefore}, adjustment: ${qty}, result would be ${qtyAfter}`,
        400
      );
    }

    inventory.qtyOnHand = qtyAfter;
    inventory.recalculateStatus();
    await inventory.save({ session });
    queueStockChange(session, inventory, { qtyBefore });

    const [tx] = await InventoryTransaction.create(
      [
        {
          productId: inventory.productId,
          inventoryId: inventory._id,
          type: ledgerType,
          quantity: qty,
          qtyBefore,
          qtyAfter,
          reason: reason || '',
          referenceType: 'MANUAL',
          performedBy,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    await flushStockChanges(session);

    const product = await Product.findById(inventory.productId)
      .select('name sku isActive')
      .lean();

    return {
      inventory: formatInventory(inventory, product),
      transaction: formatTransaction(tx),
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Internal: consume stock for an order (used by order service).
 * Must be called inside an existing session/transaction.
 */
const consumeInTx = async (
  { productId, quantity, orderId, session }
) => {
  const qty = Math.floor(Number(quantity));
  if (qty <= 0) throw new AppError('Consume quantity must be positive', 400);

  const inventory = await Inventory.findOne({ productId }).session(session);
  if (!inventory) {
    throw new AppError('Inventory not found for product', 404);
  }
  if (inventory.qtyOnHand < qty) {
    throw new AppError(
      `Not enough stock. Requested: ${qty}, Available: ${inventory.qtyOnHand}.`,
      400
    );
  }

  const qtyBefore = inventory.qtyOnHand;
  const qtyAfter = qtyBefore - qty;
  inventory.qtyOnHand = qtyAfter;
  inventory.recalculateStatus();
  await inventory.save({ session });
  queueStockChange(session, inventory, { qtyBefore });

  await InventoryTransaction.create(
    [
      {
        productId,
        inventoryId: inventory._id,
        type: 'CONSUMED',
        quantity: -qty,
        qtyBefore,
        qtyAfter,
        reason: 'Order consumption',
        referenceType: 'ORDER',
        referenceId: orderId,
      },
    ],
    { session }
  );

  return inventory;
};

/**
 * Internal: release stock (cancel/refund path).
 * Loads CONSUMED ledger for the order and writes RELEASED entries.
 * Must be called inside an existing session.
 */
const releaseForOrderInTx = async ({ orderId, session }) => {
  const consumed = await InventoryTransaction.find({
    referenceType: 'ORDER',
    referenceId: orderId,
    type: 'CONSUMED',
  }).session(session);

  for (const tx of consumed) {
    // Idempotency: skip if already released for this consume
    const alreadyReleased = await InventoryTransaction.findOne({
      referenceType: 'ORDER',
      referenceId: orderId,
      type: 'RELEASED',
      productId: tx.productId,
      quantity: Math.abs(tx.quantity),
    }).session(session);

    if (alreadyReleased) continue;

    const inventory = await Inventory.findOne({ productId: tx.productId }).session(session);
    if (!inventory) continue;

    const releaseQty = Math.abs(tx.quantity);
    const qtyBefore = inventory.qtyOnHand;
    const qtyAfter = qtyBefore + releaseQty;

    inventory.qtyOnHand = qtyAfter;
    inventory.recalculateStatus();
    await inventory.save({ session });
    queueStockChange(session, inventory, { qtyBefore });

    await InventoryTransaction.create(
      [
        {
          productId: tx.productId,
          inventoryId: inventory._id,
          type: 'RELEASED',
          quantity: releaseQty,
          qtyBefore,
          qtyAfter,
          reason: 'Order cancellation / stock release',
          referenceType: 'ORDER',
          referenceId: orderId,
        },
      ],
      { session }
    );
  }
};

/**
 * List transactions for an inventory record.
 */
const listTransactions = async (inventoryId, query = {}) => {
  const inventory = await Inventory.findById(inventoryId).lean();
  if (!inventory) throw new AppError('Inventory not found', 404);

  const { page, limit, skip } = parsePagination(query);
  const filter = { inventoryId };

  if (query.type) filter.type = query.type;

  const [data, total] = await Promise.all([
    InventoryTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InventoryTransaction.countDocuments(filter),
  ]);

  return {
    data: data.map(formatTransaction),
    meta: buildMeta(total, page, limit),
  };
};

/**
 * Update low-stock threshold only.
 */
const updateThreshold = async (id, lowStockThreshold) => {
  const inventory = await Inventory.findById(id);
  if (!inventory) throw new AppError('Inventory not found', 404);

  const thresholdBefore = inventory.lowStockThreshold;
  inventory.lowStockThreshold = Math.max(0, Math.floor(Number(lowStockThreshold)));
  inventory.recalculateStatus();
  await inventory.save();
  await onStockChanges([
    describeStockChange(inventory, { qtyBefore: inventory.qtyOnHand, thresholdBefore }),
  ]);

  const product = await Product.findById(inventory.productId)
    .select('name sku isActive')
    .lean();
  return formatInventory(inventory, product);
};

const listRecentTransactions = async (limit = 20) => {
  const txs = await InventoryTransaction.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const productIds = [...new Set(txs.map((t) => t.productId.toString()))];
  const products = await Product.find({ _id: { $in: productIds } }).select('name').lean();
  const nameMap = {};
  products.forEach((p) => { nameMap[p._id.toString()] = p.name; });

  return txs.map((tx) => {
    const formatted = formatTransaction(tx);
    formatted.productName = nameMap[tx.productId.toString()] || '';
    return formatted;
  });
};

module.exports = {
  list,
  getById,
  getByProductId,
  create,
  adjust,
  consumeInTx,
  releaseForOrderInTx,
  listTransactions,
  listRecentTransactions,
  updateThreshold,
  formatInventory,
  ADJUSTMENT_TYPES,
};
