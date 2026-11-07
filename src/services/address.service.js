'use strict';

const Address = require('../models/Address.model');
const AppError = require('../utils/AppError');
const { onAddressChanged } = require('./notification.triggers');

const list = async (userId) => {
  const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
  return addresses.map(format);
};

const getById = async (userId, id) => {
  const address = await Address.findOne({ _id: id, userId }).lean();
  if (!address) throw new AppError('Address not found', 404);
  return format(address);
};

const create = async (userId, data) => {
  const count = await Address.countDocuments({ userId });
  const isDefault = count === 0 ? true : Boolean(data.isDefault);

  // Clear existing default if needed (no transaction — works on standalone Mongo too)
  if (isDefault && count > 0) {
    await Address.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } });
  }

  const address = await Address.create({
    userId,
    label: data.label || 'Home',
    phone: data.phone || '',
    houseNo: data.houseNo || '',
    line1: data.line1,
    line2: data.line2 || '',
    landmark: data.landmark || '',
    city: data.city,
    postcode: data.postcode,
    country: data.country || 'GB',
    lat: data.lat != null ? Number(data.lat) : null,
    lng: data.lng != null ? Number(data.lng) : null,
    formattedAddress: data.formattedAddress || '',
    isDefault,
  });

  await onAddressChanged(userId, address, 'added');
  return format(address.toObject());
};

const update = async (userId, id, data) => {
  const address = await Address.findOne({ _id: id, userId });
  if (!address) throw new AppError('Address not found', 404);

  const fields = ['label', 'phone', 'houseNo', 'line1', 'line2', 'landmark', 'city', 'postcode', 'country', 'formattedAddress'];
  fields.forEach((f) => {
    if (data[f] !== undefined) address[f] = data[f];
  });
  if (data.lat !== undefined) address.lat = data.lat == null ? null : Number(data.lat);
  if (data.lng !== undefined) address.lng = data.lng == null ? null : Number(data.lng);
  await address.save();
  await onAddressChanged(userId, address, 'updated');
  return format(address.toObject());
};

const remove = async (userId, id) => {
  const address = await Address.findOne({ _id: id, userId });
  if (!address) throw new AppError('Address not found', 404);

  const wasDefault = address.isDefault;
  await address.deleteOne();

  if (wasDefault) {
    const next = await Address.findOne({ userId }).sort({ createdAt: -1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }

  await onAddressChanged(userId, address, 'removed');
  return { message: 'Address deleted' };
};

const setDefault = async (userId, id) => {
  const address = await Address.findOne({ _id: id, userId });
  if (!address) throw new AppError('Address not found', 404);

  await Address.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } });
  address.isDefault = true;
  await address.save();

  await onAddressChanged(userId, address, 'default');
  return format(address.toObject());
};

const format = (a) => ({
  id: a._id.toString(),
  userId: a.userId ? a.userId.toString() : undefined,
  label: a.label,
  phone: a.phone || '',
  houseNo: a.houseNo || '',
  line1: a.line1,
  line2: a.line2,
  landmark: a.landmark || '',
  city: a.city,
  postcode: a.postcode,
  country: a.country,
  lat: a.lat != null ? a.lat : null,
  lng: a.lng != null ? a.lng : null,
  formattedAddress: a.formattedAddress || '',
  isDefault: a.isDefault,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  setDefault,
};
