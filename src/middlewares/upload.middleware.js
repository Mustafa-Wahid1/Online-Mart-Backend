'use strict';

const multer = require('multer');
const AppError = require('../utils/AppError');

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new AppError('Only JPEG, PNG, WebP or GIF images are allowed', 400));
    }
    cb(null, true);
  },
});

module.exports = { upload };