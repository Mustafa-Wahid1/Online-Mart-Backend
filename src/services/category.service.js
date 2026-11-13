'use strict';

const mongoose = require('mongoose');
const Category = require('../models/Category.model');
const Product = require('../models/Product.model');
const Image = require('../models/Image.model');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { deleteFile } = require('../infrastructure/imagekit/imagekit');
const { parsePagination, buildMeta } = require('../utils/pagination');

const slugify = (text) =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const ensureUniqueSlug = async (baseSlug, excludeId = null) => {
  let slug = baseSlug;
  let suffix = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await Category.findOne(query).select('_id').lean();
    if (!exists) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
};

/**
 * Shape a category for the API.
 * imageUrl is NOT stored on Category: it comes from the Image collection and is passed in.
 */
const format = (c, imageUrl = '') => ({
  id: c._id.toString(),
  name: c.name,
  slug: c.slug,
  parentId: c.parentId ? c.parentId.toString() : null,
  depth: c.depth,
  isActive: c.isActive,
  description: c.description || '',
  imageUrl: imageUrl || '',
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

/**
 * ONE query for many categories (no N+1).
 * Returns Map<categoryId string, image URL>. If a category somehow has several
 * images (old data), the newest one wins.
 */
const getImageUrlMap = async (categoryIds) => {
  const ids = (categoryIds || []).filter(Boolean);
  const map = new Map();
  if (!ids.length) return map;

  const images = await Image.find({ categoryId: { $in: ids } })
    .sort({ createdAt: -1 })
    .select('image categoryId')
    .lean();

  for (const img of images) {
    const key = String(img.categoryId);
    if (img.image && !map.has(key)) map.set(key, img.image);
  }
  return map;
};

/** Format a single category (one image query). */
const formatOne = async (c) => {
  const map = await getImageUrlMap([c._id]);
  return format(c, map.get(String(c._id)) || '');
};

/**
 * Delete a category's image(s): ImageKit file + Image doc.
 * exceptImageId keeps one image (used by upload so the new image survives).
 */
const removeCategoryImages = async (categoryId, { exceptImageId = null } = {}) => {
  if (!categoryId) return 0;
  const filter = { categoryId };
  if (exceptImageId) filter._id = { $ne: exceptImageId };

  const images = await Image.find(filter).select('fileId').lean();
  if (!images.length) return 0;

  await Promise.all(images.map((i) => deleteFile(i.fileId)));
  await Image.deleteMany({ _id: { $in: images.map((i) => i._id) } });
  return images.length;
};

/**
 * Public list: active categories only, optionally nested.
 */
/**
 * Public category list — flat array with productCount + childCount.
 * Frontend expects CategoryRow[] (id, parentId, depth, productCount, …), not a tree.
 */
const listPublic = async () => {
  const categories = await Category.find({ isActive: true })
    .sort({ name: 1 })
    .lean();

  if (!categories.length) return [];

  const ids = categories.map((c) => c._id);

  const [imageMap, productCounts, childCounts] = await Promise.all([
    getImageUrlMap(ids),
    // Active products per category (one aggregation, no N+1)
    Product.aggregate([
      { $match: { categoryId: { $in: ids }, isActive: true } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]),
    Category.aggregate([
      { $match: { parentId: { $in: ids }, isActive: true } },
      { $group: { _id: '$parentId', count: { $sum: 1 } } },
    ]),
  ]);

  const productCountMap = new Map(
    productCounts.map((r) => [String(r._id), r.count]),
  );
  const childCountMap = new Map(
    childCounts.map((r) => [String(r._id), r.count]),
  );

  return categories.map((c) => {
    const id = c._id.toString();
    return {
      ...format(c, imageMap.get(id) || ''),
      productCount: productCountMap.get(id) || 0,
      childCount: childCountMap.get(id) || 0,
    };
  });
};

/**
 * Admin list with pagination and filters.
 */
const listAdmin = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true' || query.isActive === true;
  }
  if (query.parentId === 'null' || query.parentId === null) {
    filter.parentId = null;
  } else if (query.parentId) {
    filter.parentId = query.parentId;
  }
  if (query.search) {
    filter.name = new RegExp(query.search.trim(), 'i');
  }

  const [data, total] = await Promise.all([
    Category.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Category.countDocuments(filter),
  ]);

  const ids = data.map((c) => c._id);
  const [imageMap, productCounts, childCounts] = await Promise.all([
    getImageUrlMap(ids),
    ids.length
      ? Product.aggregate([
          { $match: { categoryId: { $in: ids }, isActive: true } },
          { $group: { _id: '$categoryId', count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
    ids.length
      ? Category.aggregate([
          { $match: { parentId: { $in: ids } } },
          { $group: { _id: '$parentId', count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
  ]);

  const productCountMap = new Map(
    productCounts.map((r) => [String(r._id), r.count]),
  );
  const childCountMap = new Map(
    childCounts.map((r) => [String(r._id), r.count]),
  );

  return {
    data: data.map((c) => {
      const id = c._id.toString();
      return {
        ...format(c, imageMap.get(id) || ''),
        productCount: productCountMap.get(id) || 0,
        childCount: childCountMap.get(id) || 0,
      };
    }),
    meta: buildMeta(total, page, limit),
  };
};

const getById = async (id, { admin = false } = {}) => {
  const category = await Category.findById(id).lean();
  if (!category) throw new AppError('Category not found', 404);
  if (!admin && !category.isActive) throw new AppError('Category not found', 404);
  const [formatted, productCount, childCount] = await Promise.all([
    formatOne(category),
    Product.countDocuments({ categoryId: category._id, isActive: true }),
    Category.countDocuments({ parentId: category._id }),
  ]);
  return { ...formatted, productCount, childCount };
};

/**
 * Create category (image is NOT required; upload it afterwards with the new category id).
 * - Max depth 1 (root depth 0, child depth 1)
 * - Parent must exist, be active, and have no products (leaf only if parent)
 * - Parent with products cannot have children → 409
 */
const create = async ({ name, parentId, description, isActive }) => {
  if (!name || !String(name).trim()) {
    throw new AppError('Name is required', 400);
  }

  let depth = 0;
  let parent = null;

  if (parentId) {
    parent = await Category.findById(parentId);
    if (!parent) throw new AppError('Parent category not found', 404);
    if (!parent.isActive) throw new AppError('Parent category is inactive', 400);
    if (parent.depth >= 1) {
      throw new AppError('Maximum category depth is 1 (two levels)', 400);
    }

    const productCount = await Product.countDocuments({ categoryId: parent._id });
    if (productCount > 0) {
      throw new AppError(
        'Parent category already has products and cannot have children',
        409
      );
    }
    depth = 1;
  }

  const baseSlug = slugify(name);
  if (!baseSlug) throw new AppError('Invalid category name for slug', 400);
  const slug = await ensureUniqueSlug(baseSlug);

  const category = await Category.create({
    name: name.trim(),
    slug,
    parentId: parent ? parent._id : null,
    depth,
    description: description || '',
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  });

  // No image yet: it is added later via POST /admin/uploads/product-image { categoryId }
  return format(category.toObject());
};

/**
 * Update category (name, description, isActive, parentId).
 * Re-parent rules: no cycles, depth limit, parent has no products.
 */
const update = async (id, data) => {
  const category = await Category.findById(id);
  if (!category) throw new AppError('Category not found', 404);

  if (data.name !== undefined) {
    const newName = String(data.name).trim();
    if (!newName) throw new AppError('Name is required', 400);
    if (newName !== category.name) {
      category.name = newName;
      const baseSlug = slugify(newName);
      category.slug = await ensureUniqueSlug(baseSlug, category._id);
    }
  }

  if (data.description !== undefined) {
    category.description = data.description || '';
  }

  // Images live only in the Image collection and are changed through
  // POST /admin/uploads/product-image { categoryId } — nothing to do here.

  if (data.isActive !== undefined) {
    category.isActive = Boolean(data.isActive);
  }

  // Re-parent
  if (data.parentId !== undefined) {
    const newParentId = data.parentId === null || data.parentId === '' ? null : data.parentId;

    if (newParentId && newParentId.toString() === category._id.toString()) {
      throw new AppError('Category cannot be its own parent', 400);
    }

    if (newParentId === null) {
      // Moving to root
      // Check if this category has children — still allowed at root
      category.parentId = null;
      category.depth = 0;
    } else {
      const parent = await Category.findById(newParentId);
      if (!parent) throw new AppError('Parent category not found', 404);
      if (!parent.isActive) throw new AppError('Parent category is inactive', 400);
      if (parent.depth >= 1) {
        throw new AppError('Maximum category depth is 1 (two levels)', 400);
      }

      // Prevent cycle: parent must not be a descendant of this category
      // Since max depth is 1, only need to check that parent is not a child of this category
      if (parent.parentId && parent.parentId.toString() === category._id.toString()) {
        throw new AppError('Cannot create cycle: parent is a child of this category', 400);
      }

      // Parent must not already have products
      const productCount = await Product.countDocuments({ categoryId: parent._id });
      if (productCount > 0) {
        throw new AppError(
          'Parent category already has products and cannot have children',
          409
        );
      }

      // If this category currently has children, it cannot become a child (would make depth 2)
      const childCount = await Category.countDocuments({ parentId: category._id });
      if (childCount > 0) {
        throw new AppError(
          'Category has children and cannot be moved under another category (max depth 1)',
          400
        );
      }

      // If this category has products, it becomes a leaf under parent — allowed
      category.parentId = parent._id;
      category.depth = 1;
    }
  }

  await category.save();

  return await formatOne(category.toObject());
};

/**
 * Soft-style delete: only if no children and no products.
 * (Spec says DELETE — we enforce no products/children then hard-delete, or deactivate)
 * Prefer hard delete only when empty; otherwise 409.
 */
const remove = async (id) => {
  const category = await Category.findById(id);
  if (!category) throw new AppError('Category not found', 404);

  const childCount = await Category.countDocuments({ parentId: category._id });
  if (childCount > 0) {
    throw new AppError('Cannot delete category that has child categories', 409);
  }

  const productCount = await Product.countDocuments({ categoryId: category._id });
  if (productCount > 0) {
    throw new AppError('Cannot delete category that has products', 409);
  }

  await category.deleteOne();

  // Cleanup: delete the category's image(s) (ImageKit file + Image doc).
  // The category is already gone, so a cleanup failure must not fail the request.
  try {
    await removeCategoryImages(category._id);
  } catch (err) {
    logger.warn(
      { categoryId: category._id.toString(), err: err.message },
      'Category image cleanup failed'
    );
  }

  return { message: 'Category deleted' };
};


module.exports = {
  listPublic,
  listAdmin,
  getById,
  create,
  update,
  remove,
  slugify,
  ensureUniqueSlug,
  removeCategoryImages,
};
