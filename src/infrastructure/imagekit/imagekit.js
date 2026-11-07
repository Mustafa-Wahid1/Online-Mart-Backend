'use strict';

const ImageKit = require('imagekit');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');

const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

let imagekit = null;

if (publicKey && privateKey && urlEndpoint) {
  imagekit = new ImageKit({
    publicKey,
    privateKey,
    urlEndpoint,
  });
}

const isConfigured = () => Boolean(imagekit);

/**
 * Upload a file buffer to ImageKit.
 * @param {Buffer} buffer
 * @param {string} fileName
 * @param {string} folder - e.g. "/products" or "/categories"
 * @returns {Promise<{ url: string, fileId: string, name: string }>}
 */
const uploadBuffer = async (buffer, fileName, folder = '/online-mart') => {
  if (!imagekit) {
    throw new AppError(
      'ImageKit is not configured. Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT',
      500
    );
  }

  const result = await imagekit.upload({
    file: buffer,
    fileName,
    folder,
    useUniqueFileName: true,
  });

  return {
    url: result.url,
    fileId: result.fileId,
    name: result.name,
  };
};

/**
 * Delete a file from ImageKit by fileId.
 * Never throws: a missing/already-deleted file or a network error is logged and ignored,
 * so DB cleanup can continue. Empty fileId is skipped.
 * @param {string} fileId
 * @returns {Promise<boolean>} true if ImageKit confirmed the delete
 */
const deleteFile = async (fileId) => {
  if (!fileId || !imagekit) return false;
  try {
    await imagekit.deleteFile(fileId);
    return true;
  } catch (err) {
    logger.warn({ fileId, err: err && err.message }, 'ImageKit deleteFile failed (ignored)');
    return false;
  }
};

module.exports = { uploadBuffer, deleteFile, isConfigured };