'use strict';

const mongoose = require('mongoose');

/**
 * Separate Image collection.
 * Flow: upload → save only here. Products/Categories link via productId/categoryId. No imageUrl stored on Product/Category.
 */
const imageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    image: {
      type: String, // ImageKit CDN URL
      required: true,
    },
    fileId: {
      type: String, // ImageKit fileId (for delete later)
      default: '',
    },
    /** optional links */
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

const Image = mongoose.model('Image', imageSchema);
module.exports = Image;
