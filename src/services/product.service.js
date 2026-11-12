'use strict';

const mongoose = require('mongoose');
const Product = require('../models/Product.model');
const Image = require('../models/Image.model');
const Category = require('../models/Category.model');
const Inventory = require('../models/Inventory.model');
const Counter = require('../models/Counter.model');
const AppError = require('../utils/AppError');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { isValidPrice, toString: moneyToString } = require('../utils/money');
const { slugify } = require('./category.service');

/**
 * ONE query for many products (no N+1).
 * Returns Map<productId string, [{ id, url }]> in upload order (oldest first),
 * so the first image is the product's main image.
 */
const getProductImagesMap = async (productIds) => {
  const ids = (productIds || []).filter(Boolean);
  const map = new Map();
  if (!ids.length) return map;

  const docs = await Image.find({ productId: { $in: ids } })
    .sort({ createdAt: 1, _id: 1 })
    .select('image productId')
    .lean();

  for (const d of docs) {
    if (!d.image) continue;
    const key = String(d.productId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ id: d._id.toString(), url: d.image });
  }
  return map;
};

/**
 * images (optional): pre-loaded [{ id, url }] from getProductImagesMap.
 * When omitted, the product's images are fetched here (single product).
 */
const formatProduct = async (p, inventory = null, images = undefined, categoryName = undefined) => {
  const obj = p.toObject ? p.toObject() : { ...p };
  // Images come only from Image collection
  let imageList = images;
  if (!imageList) {
    const map = await getProductImagesMap([obj._id]);
    imageList = map.get(String(obj._id)) || [];
  }
  const urls = imageList.map((i) => i.url);

  // Resolve category name if not preloaded
  let catName = categoryName;
  if (catName === undefined && obj.categoryId) {
    const cat =
      typeof obj.categoryId === 'object' && obj.categoryId.name
        ? obj.categoryId
        : await Category.findById(obj.categoryId).select('name').lean();
    catName = cat ? cat.name : '';
  }

  const result = {
    id: obj._id.toString(),
    name: obj.name,
    slug: obj.slug,
    sku: obj.sku,
    categoryId: obj.categoryId
      ? (obj.categoryId._id ? obj.categoryId._id.toString() : obj.categoryId.toString())
      : null,
    categoryName: catName || '',
    description: obj.description || '',
    price: moneyToString(obj.price),
    unit: obj.unit || 'each',
    minimumOrderQuantity: obj.minimumOrderQuantity,
    maximumOrderQuantity: obj.maximumOrderQuantity,
    isActive: obj.isActive,
    imageUrl: urls[0] || '',
    imageUrls: urls,
    images: imageList, // [{ id, url }] — id is needed to delete one image
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
  if (inventory) {
    result.inventory = {
      qtyOnHand: inventory.qtyOnHand,
      status: inventory.status,
      lowStockThreshold: inventory.lowStockThreshold,
    };
  }
  return result;
};

/**
 * Ensure category is active and is a leaf (no children).
 * Products may only sit on leaf + active categories.
 */
const assertLeafActiveCategory = async (categoryId, session = null) => {
  const opts = session ? { session } : {};
  const category = await Category.findById(categoryId, null, opts);
  if (!category) throw new AppError('Category not found', 404);
  if (!category.isActive) throw new AppError('Category is inactive', 400);

  const childCount = await Category.countDocuments(
    { parentId: category._id },
    session ? { session } : {}
  );
  if (childCount > 0) {
    throw new AppError('Products can only be assigned to leaf categories', 400);
  }
  return category;
};

const ensureUniqueProductSlug = async (baseSlug, excludeId = null, session = null) => {
  let slug = baseSlug;
  let suffix = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const opts = session ? { session } : {};
    const exists = await Product.findOne(query, null, opts).select('_id').lean();
    if (!exists) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
};

/**
 * SKU = <CAT3>-<000001> from Counter.
 * CAT3 = first 3 letters of category slug uppercased, padded if needed.
 */
const generateSku = async (categorySlug, session = null) => {
  const prefix = (categorySlug || 'GEN')
    .replace(/[^a-z0-9]/gi, '')
    .substring(0, 3)
    .toUpperCase()
    .padEnd(3, 'X');
  const seq = await Counter.getNextSequence(`sku:${prefix}`, session);
  const num = String(seq).padStart(6, '0');
  return `${prefix}-${num}`;
};

/**
 * Public list: always force isActive: true.
 */
const listPublic = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { isActive: true };

  if (query.categoryId) {
    filter.categoryId = query.categoryId;
  }
  if (query.search) {
    const s = query.search.trim();
    filter.$or = [
      { name: new RegExp(s, 'i') },
      { description: new RegExp(s, 'i') },
      { sku: new RegExp(s, 'i') },
    ];
  }
  if (query.minPrice !== undefined) {
    filter.price = { ...filter.price, $gte: parseFloat(query.minPrice) };
  }
  if (query.maxPrice !== undefined) {
    filter.price = { ...filter.price, $lte: parseFloat(query.maxPrice) };
  }
  // "In stock only": keep products whose inventory still has units on hand
  if (query.inStock === 'true' || query.inStock === true) {
    const inStockIds = await Inventory.find({ qtyOnHand: { $gt: 0 } }).distinct('productId');
    filter._id = { $in: inStockIds };
  }

  const [data, total] = await Promise.all([
    Product.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  const productIds = data.map((p) => p._id);
  const inventories = await Inventory.find({ productId: { $in: productIds } }).lean();
  const invMap = {};
  inventories.forEach((inv) => {
    invMap[inv.productId.toString()] = inv;
  });

  const imageMap = await getProductImagesMap(productIds);

  const categoryIds = [...new Set(data.map((p) => p.categoryId).filter(Boolean))];
  const categories = categoryIds.length
    ? await Category.find({ _id: { $in: categoryIds } }).select('name').lean()
    : [];
  const catNameMap = {};
  categories.forEach((c) => {
    catNameMap[c._id.toString()] = c.name;
  });

  return {
    data: await Promise.all(
      data.map((p) =>
        formatProduct(
          p,
          invMap[p._id.toString()] || null,
          imageMap.get(p._id.toString()) || [],
          catNameMap[p.categoryId ? p.categoryId.toString() : ''] || ''
        )
      )
    ),
    meta: buildMeta(total, page, limit),
  };
};

/**
 * Public detail: inactive → 404.
 */
const getPublicById = async (id) => {
  const product = await Product.findById(id).lean();
  if (!product || !product.isActive) {
    throw new AppError('Product not found', 404);
  }
  const inventory = await Inventory.findOne({ productId: product._id }).lean();
  return await formatProduct(product, inventory);
};

/**
 * Admin list: includes inactive.
 */
const listAdmin = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true' || query.isActive === true;
  }
  if (query.categoryId) filter.categoryId = query.categoryId;
  if (query.search) {
    const s = query.search.trim();
    filter.$or = [
      { name: new RegExp(s, 'i') },
      { sku: new RegExp(s, 'i') },
      { slug: new RegExp(s, 'i') },
    ];
  }

  const [data, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  const productIds = data.map((p) => p._id);
  const inventories = await Inventory.find({ productId: { $in: productIds } }).lean();
  const invMap = {};
  inventories.forEach((inv) => {
    invMap[inv.productId.toString()] = inv;
  });

  const imageMap = await getProductImagesMap(productIds);

  const categoryIds = [...new Set(data.map((p) => p.categoryId).filter(Boolean))];
  const categories = categoryIds.length
    ? await Category.find({ _id: { $in: categoryIds } }).select('name').lean()
    : [];
  const catNameMap = {};
  categories.forEach((c) => {
    catNameMap[c._id.toString()] = c.name;
  });

  return {
    data: await Promise.all(
      data.map((p) =>
        formatProduct(
          p,
          invMap[p._id.toString()] || null,
          imageMap.get(p._id.toString()) || [],
          catNameMap[p.categoryId ? p.categoryId.toString() : ''] || ''
        )
      )
    ),
    meta: buildMeta(total, page, limit),
  };
};

const getAdminById = async (id) => {
  const product = await Product.findById(id).lean();
  if (!product) throw new AppError('Product not found', 404);
  const inventory = await Inventory.findOne({ productId: product._id }).lean();
  return await formatProduct(product, inventory);
};

/**
 * Create product + initial inventory (qty 0) in a transaction.
 * Images are NOT required here: upload them afterwards with the new product id.
 */
const create = async (data) => {
  const {
    name,
    categoryId,
    description,
    price,
    unit,
    minimumOrderQuantity,
    maximumOrderQuantity,
    initialQty,
    lowStockThreshold,
  } = data;

  if (!name || !String(name).trim()) {
    throw new AppError('Name is required', 400);
  }
  if (!categoryId) throw new AppError('categoryId is required', 400);
  if (!isValidPrice(price)) {
    throw new AppError('Price must be >= 0.01 and have at most 2 decimal places', 400);
  }

  const minQty = minimumOrderQuantity !== undefined ? Number(minimumOrderQuantity) : 1;
  const maxQty = maximumOrderQuantity !== undefined ? Number(maximumOrderQuantity) : 99;
  if (maxQty < minQty) {
    throw new AppError('maximumOrderQuantity must be >= minimumOrderQuantity', 400);
  }
  if (minQty < 1) throw new AppError('minimumOrderQuantity must be >= 1', 400);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const category = await assertLeafActiveCategory(categoryId, session);

    // Unique name within category
    const nameClash = await Product.findOne({
      name: name.trim(),
      categoryId: category._id,
    }).session(session);
    if (nameClash) {
      throw new AppError('A product with this name already exists in the category', 409);
    }

    const nameSlug = slugify(name);
    const baseSlug = `${category.slug}-${nameSlug}`;
    const slug = await ensureUniqueProductSlug(baseSlug, null, session);
    const sku = await generateSku(category.slug, session);

    const [product] = await Product.create(
      [
        {
          name: name.trim(),
          slug,
          sku,
          categoryId: category._id,
          description: description || '',
          price: Number(Number(price).toFixed(2)),
          unit: unit || 'each',
          minimumOrderQuantity: minQty,
          maximumOrderQuantity: maxQty,
          isActive: true,
        },
      ],
      { session }
    );

    const qty = initialQty !== undefined ? Math.max(0, Math.floor(Number(initialQty))) : 0;
    const threshold =
      lowStockThreshold !== undefined ? Math.max(0, Math.floor(Number(lowStockThreshold))) : 10;

    const inventory = new Inventory({
      productId: product._id,
      qtyOnHand: qty,
      lowStockThreshold: threshold,
    });
    inventory.recalculateStatus();
    await inventory.save({ session });

    await session.commitTransaction();

    // No images yet: they are added later via POST /admin/uploads/product-image { productId }
    return await formatProduct(product, inventory.toObject(), []);
  } catch (err) {
    await session.abortTransaction();
    if (err.code === 11000) {
      throw new AppError('Duplicate product name, slug or SKU', 409);
    }
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Update product. No hard delete — use isActive: false.
 * Changing category must still target a leaf active category.
 */
const update = async (id, data) => {
  const product = await Product.findById(id);
  if (!product) throw new AppError('Product not found', 404);

  if (data.price !== undefined && !isValidPrice(data.price)) {
    throw new AppError('Price must be >= 0.01 and have at most 2 decimal places', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (data.categoryId && data.categoryId.toString() !== product.categoryId.toString()) {
      const category = await assertLeafActiveCategory(data.categoryId, session);
      product.categoryId = category._id;

      // Rebuild slug if name or category changes
      const nameForSlug = data.name !== undefined ? String(data.name).trim() : product.name;
      const nameSlug = slugify(nameForSlug);
      const baseSlug = `${category.slug}-${nameSlug}`;
      product.slug = await ensureUniqueProductSlug(baseSlug, product._id, session);
    } else if (data.name !== undefined && String(data.name).trim() !== product.name) {
      const category = await Category.findById(product.categoryId).session(session);
      const nameSlug = slugify(data.name);
      const baseSlug = `${category.slug}-${nameSlug}`;
      product.slug = await ensureUniqueProductSlug(baseSlug, product._id, session);
      product.name = String(data.name).trim();
    }

    if (data.name !== undefined && data.categoryId === undefined) {
      // name already handled above if different; ensure set
      product.name = String(data.name).trim();
    }

    if (data.description !== undefined) product.description = data.description || '';
    if (data.price !== undefined) product.price = Number(Number(data.price).toFixed(2));
    if (data.unit !== undefined) product.unit = data.unit || 'each';
    // Images live only in the Image collection and are changed through
    // POST /admin/uploads/product-image { productId } and DELETE /admin/uploads/image/:id.
    if (data.isActive !== undefined) product.isActive = Boolean(data.isActive);

    if (data.minimumOrderQuantity !== undefined) {
      product.minimumOrderQuantity = Number(data.minimumOrderQuantity);
    }
    if (data.maximumOrderQuantity !== undefined) {
      product.maximumOrderQuantity = Number(data.maximumOrderQuantity);
    }
    if (product.maximumOrderQuantity < product.minimumOrderQuantity) {
      throw new AppError('maximumOrderQuantity must be >= minimumOrderQuantity', 400);
    }

    // Unique name within category
    if (data.name !== undefined || data.categoryId !== undefined) {
      const clash = await Product.findOne({
        name: product.name,
        categoryId: product.categoryId,
        _id: { $ne: product._id },
      }).session(session);
      if (clash) {
        throw new AppError('A product with this name already exists in the category', 409);
      }
    }

    await product.save({ session });
    await session.commitTransaction();

    const inventory = await Inventory.findOne({ productId: product._id }).lean();
    return await formatProduct(product, inventory);
  } catch (err) {
    await session.abortTransaction();
    if (err.code === 11000) {
      throw new AppError('Duplicate product name, slug or SKU', 409);
    }
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Soft deactivate (no hard delete).
 */
const deactivate = async (id) => {
  const product = await Product.findById(id);
  if (!product) throw new AppError('Product not found', 404);
  product.isActive = false;
  await product.save();
  const inventory = await Inventory.findOne({ productId: product._id }).lean();
  return await formatProduct(product, inventory);
};


module.exports = {
  listPublic,
  getPublicById,
  listAdmin,
  getAdminById,
  create,
  update,
  deactivate,
  formatProduct,
  getProductImagesMap,
  assertLeafActiveCategory,
  generateSku,
};
