'use strict';
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const env = require('../config/env');
const EmailLog = require('../models/EmailLog.model');
const OtpCode = require('../models/OtpCode.model');

const main = async () => {
  await mongoose.connect(env.MONGODB_URI);

  const logs = await EmailLog.find().sort({ createdAt: -1 }).limit(10).lean();
  console.log('--- EmailLog (last 10) ---');
  if (logs.length === 0) console.log('(empty)');
  logs.forEach((l) => console.log(l.createdAt.toISOString(), l.type, l.status, l.to, l.error || ''));

  const otps = await OtpCode.find().sort({ createdAt: -1 }).limit(5).lean();
  console.log('--- OtpCode (last 5) ---');
  if (otps.length === 0) console.log('(empty)');
  otps.forEach((o) => console.log(o.email, o.purpose, 'sendCount=' + o.sendCount, 'lastSentAt=' + o.lastSentAt.toISOString()));

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});