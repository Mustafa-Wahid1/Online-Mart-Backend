'use strict';

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const User = require('../models/User.model');

async function seed() {
  await mongoose.connect(env.MONGODB_URI);
  const existing = await User.findOne({ role: 'ADMIN' });
  if (existing) {
    console.log('Admin already exists:', existing.email);
    process.exit(0);
  }
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD required in .env');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, env.BCRYPT_COST);
  const admin = await User.create({
    name: env.ADMIN_NAME || 'Admin',
    email: env.ADMIN_EMAIL.toLowerCase(),
    passwordHash,
    role: 'ADMIN',
    isActive: true,
  });
  console.log('Admin created:', admin.email);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
