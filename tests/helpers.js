'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const env = require('../src/config/env');
const User = require('../src/models/User.model');
const Category = require('../src/models/Category.model');
const Product = require('../src/models/Product.model');
const Inventory = require('../src/models/Inventory.model');
const Counter = require('../src/models/Counter.model');

const connectTestDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.MONGODB_URI);
  }
};

const clearDB = async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
};

const disconnectTestDB = async () => {
  await mongoose.disconnect();
};

const createCustomer = async (overrides = {}) => {
  const password = overrides.password || 'Customer@123';
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_COST);
  const user = await User.create({
    name: overrides.name || 'Test Customer',
    email: (overrides.email || `customer-${Date.now()}@test.com`).toLowerCase(),
    phone: overrides.phone,
    passwordHash,
    role: 'CUSTOMER',
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
  });
  return { user, password };
};

const createAdmin = async (overrides = {}) => {
  const password = overrides.password || 'Admin@123456';
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_COST);
  const user = await User.create({
    name: overrides.name || 'Test Admin',
    email: (overrides.email || `admin-${Date.now()}@test.com`).toLowerCase(),
    passwordHash,
    role: 'ADMIN',
    isActive: true,
  });
  return { user, password };
};

const loginAs = async (app, email, password) => {
  const res = await request(app)
    .post(`/${env.URL_PREFIX}/auth/login`)
    .send({ email, password });
  return res;
};

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

/**
 * Seed a leaf category + product + inventory for cart/order tests.
 */
const seedCatalog = async () => {
  const parent = await Category.create({
    name: 'Groceries',
    slug: 'groceries',
    depth: 0,
    isActive: true,
  });
  const leaf = await Category.create({
    name: 'Dairy',
    slug: 'dairy',
    parentId: parent._id,
    depth: 1,
    isActive: true,
  });

  await Counter.findOneAndUpdate(
    { _id: 'sku' },
    { $setOnInsert: { seq: 0 } },
    { upsert: true, new: true }
  );

  const product = await Product.create({
    name: 'Whole Milk 2L',
    slug: 'dairy-whole-milk-2l',
    sku: 'DAI-000001',
    categoryId: leaf._id,
    price: 1.89,
    isActive: true,
    minimumOrderQuantity: 1,
    maximumOrderQuantity: 20,
    unit: 'bottle',
  });

  const inventory = await Inventory.create({
    productId: product._id,
    qtyOnHand: 100,
    lowStockThreshold: 10,
    status: 'IN_STOCK',
  });

  return { parent, leaf, product, inventory };
};

module.exports = {
  connectTestDB,
  clearDB,
  disconnectTestDB,
  createCustomer,
  createAdmin,
  loginAs,
  authHeader,
  seedCatalog,
  env,
};
