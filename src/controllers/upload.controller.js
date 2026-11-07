'use strict';

const mongoose = require('mongoose');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { uploadBuffer, deleteFile } = require('../infrastructure/imagekit/imagekit');
const Image = require('../models/Image.model');
const Category = require('../models/Category.model');
const Product = require('../models/Product.model');
const { removeCategoryImages } = require('../services/category.service');

/** A product can have several images, up to this many. */
const MAX_PRODUCT_IMAGES = 8;

/**
 * POST /admin/uploads/product-image
 * multipart field name: "image"
 * Optional body fields: name, categoryId, productId (not both)
 *
 * 1. categoryId given: validate it and make sure the category exists
 *    productId given:  validate it, make sure the product exists and has room for more images
 * 2. Upload file to ImageKit
 * 3. Save document in Image collection
 * 4. Category: remove the category's previous image(s) (ImageKit file + Image doc),
 *    so a category has at most ONE image.
 *    Product: the image is ADDED (a product can have up to MAX_PRODUCT_IMAGES).
 * 5. Return { url, fileId, imageId }
 */
const productImage = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('Image file is required (field name: image)', 400);
    }

    const categoryId = (req.body && req.body.categoryId) || null;
    const productId = (req.body && req.body.productId) || null;

    if (categoryId && productId) {
      throw new AppError('Send either categoryId or productId, not both', 400);
    }

    if (categoryId) {
      if (!mongoose.isValidObjectId(categoryId)) {
        throw new AppError('Invalid categoryId', 400);
      }
      const category = await Category.findById(categoryId).select('_id').lean();
      if (!category) throw new AppError('Category not found', 404);
    }

    if (productId) {
      if (!mongoose.isValidObjectId(productId)) {
        throw new AppError('Invalid productId', 400);
      }
      const product = await Product.findById(productId).select('_id').lean();
      if (!product) throw new AppError('Product not found', 404);

      const count = await Image.countDocuments({ productId });
      if (count >= MAX_PRODUCT_IMAGES) {
        throw new AppError(`A product can have at most ${MAX_PRODUCT_IMAGES} images`, 400);
      }
    }

    const ext = (req.file.originalname || '').split('.').pop() || 'jpg';
    const fileName = `img-${Date.now()}.${ext}`;

    // Upload first: if this fails, the category's current image is left untouched.
    const result = await uploadBuffer(req.file.buffer, fileName, '/online-mart');

    // Save in separate Image collection
    const imageDoc = await Image.create({
      name: (req.body && req.body.name) || req.file.originalname || fileName,
      image: result.url,
      fileId: result.fileId || '',
      categoryId,
      productId,
    });

    // One image per category: delete the old ones (ImageKit file + Image doc)
    if (categoryId) {
      await removeCategoryImages(categoryId, { exceptImageId: imageDoc._id });
    }

    return success(
      res,
      {
        url: result.url,
        fileId: result.fileId,
        imageId: imageDoc._id.toString(),
      },
      201
    );
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /admin/uploads/image/:imageId
 * Removes one image: ImageKit file + Image document.
 */
const deleteImage = async (req, res, next) => {
  try {
    const { imageId } = req.params;
    if (!mongoose.isValidObjectId(imageId)) {
      throw new AppError('Invalid image id', 400);
    }

    const image = await Image.findById(imageId).select('fileId').lean();
    if (!image) throw new AppError('Image not found', 404);

    await deleteFile(image.fileId);
    await Image.deleteOne({ _id: image._id });

    return success(res, { message: 'Image deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { productImage, deleteImage };
