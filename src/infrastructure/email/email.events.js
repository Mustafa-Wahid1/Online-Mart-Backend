'use strict';

const User = require('../../models/User.model');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { sendEmail, recordSkipped } = require('./email.service');

const T = {
  verifyOtp: require('./templates/verifyEmailOtp'),
  resetOtp: require('./templates/passwordResetOtp'),
  passwordChanged: require('./templates/passwordChanged'),
  welcome: require('./templates/welcome'),
  orderConfirmed: require('./templates/orderConfirmed'),
  paymentFailed: require('./templates/paymentFailed'),
  paymentExpired: require('./templates/paymentExpired'),
  orderCancelled: require('./templates/orderCancelled'),
  refundPending: require('./templates/refundPending'),
  refunded: require('./templates/refunded'),
  returnRefunded: require('./templates/returnRefunded'),
  readyForPickup: require('./templates/readyForPickup'),
  delivered: require('./templates/delivered'),
  backInStock: require('./templates/wishlistBackInStock'),
  adminNewOrder: require('./templates/adminNewOrder'),
  adminRefundNeeded: require('./templates/adminRefundNeeded'),
  adminError: require('./templates/adminError'),
  lowStockDigest: require('./templates/lowStockDigest'),
};

const idStr = (v) => String(v && v._id ? v._id : v);

/** Loads a customer; returns null (and records SKIPPED) when they must not receive business email. */
const customerFor = async (userId, type) => {
  const u = await User.findById(userId).select('name email isActive').lean();
  if (!u || !u.email) return null;
  if (!u.isActive) {
    await recordSkipped(u.email, type, 'inactive user');
    return null;
  }
  return u;
};

/** The admin (there is only one) or ADMIN_EMAIL as a fallback. */
const adminRecipient = async () => {
  const admin = await User.findOne({ role: 'ADMIN' }).select('name email isActive').lean();
  if (admin) return admin.isActive ? { email: admin.email, name: admin.name } : null;
  return env.ADMIN_EMAIL ? { email: env.ADMIN_EMAIL, name: 'Admin' } : null;
};

const deliver = (to, type, entityId, status, tpl, extra = {}) =>
  sendEmail({
    to: to.email,
    toName: to.name,
    type,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    dedupeKey: entityId ? `${type}:${entityId}:${status || ''}` : undefined,
    ...extra,
  });

/* ---------------- OTP + account (user already loaded by the caller) ---------------- */

const sendVerifyOtp = ({ user, code }) =>
  sendEmail({
    to: user.email,
    toName: user.name,
    type: 'OTP_VERIFY_EMAIL',
    ...T.verifyOtp({ name: user.name, code, expiresMinutes: env.OTP_EXPIRES_MINUTES }),
    otp: code,
  });

const sendResetOtp = ({ user, code }) =>
  sendEmail({
    to: user.email,
    toName: user.name,
    type: 'OTP_RESET_PASSWORD',
    ...T.resetOtp({ name: user.name, code, expiresMinutes: env.OTP_EXPIRES_MINUTES }),
    otp: code,
  });

const welcome = (user) =>
  deliver({ email: user.email, name: user.name }, 'WELCOME', idStr(user), 'VERIFIED', T.welcome({ name: user.name }));

const passwordChanged = (user, changedAt = new Date()) =>
  deliver(
    { email: user.email, name: user.name },
    'PASSWORD_CHANGED',
    null,
    null,
    T.passwordChanged({ name: user.name, changedAt })
  );

/* ---------------- customer: orders ---------------- */

/** E2 — payment received + order confirmed (one email). */
const orderConfirmed = async (payment, order) => {
  const user = await customerFor(order.userId, 'ORDER_CONFIRMED');
  if (!user) return;
  await deliver(user, 'ORDER_CONFIRMED', idStr(order), 'CONFIRMED', T.orderConfirmed({ name: user.name, order, payment }));
};

/** E3 — payment failed. `order` needs _id, orderNumber, userId, total, status, paymentStatus, paymentExpiresAt. */
const paymentFailed = async (payment, order) => {
  if (!order) return;
  const user = await customerFor(order.userId, 'PAYMENT_FAILED');
  if (!user) return;
  const canRetry =
    order.status === 'PENDING' &&
    order.paymentStatus === 'UNPAID' &&
    (!order.paymentExpiresAt || new Date(order.paymentExpiresAt) > new Date());
  await deliver(user, 'PAYMENT_FAILED', idStr(payment), 'FAILED', T.paymentFailed({ name: user.name, order, canRetry }));
};

/** E4 — payment window expired (auto-cancel). */
const paymentExpired = async (order) => {
  const user = await customerFor(order.userId, 'PAYMENT_EXPIRED');
  if (!user) return;
  await deliver(user, 'PAYMENT_EXPIRED', idStr(order), 'CANCELLED', T.paymentExpired({ name: user.name, order }));
};

/**
 * E5 (unpaid cancel) or E6 (paid cancel -> refund started), plus A2 when a customer cancelled a paid order.
 * `customerName` is passed by the trigger when it already has it.
 */
const orderCancelled = async ({ order, wasPaid, cancelledBy, customerName }) => {
  const user = await customerFor(order.userId, wasPaid ? 'REFUND_PENDING' : 'ORDER_CANCELLED');
  if (user) {
    if (wasPaid) {
      await deliver(user, 'REFUND_PENDING', idStr(order), 'REFUND_PENDING', T.refundPending({ name: user.name, order }));
    } else {
      await deliver(
        user,
        'ORDER_CANCELLED',
        idStr(order),
        'CANCELLED',
        T.orderCancelled({ name: user.name, order, byAdmin: cancelledBy !== 'CUSTOMER' })
      );
    }
  }

  if (wasPaid && cancelledBy === 'CUSTOMER') {
    const admin = await adminRecipient();
    if (admin) {
      const who = customerName || (user && user.name) || 'A customer';
      await deliver(admin, 'ADMIN_REFUND_NEEDED', idStr(order), 'REFUND_PENDING', T.adminRefundNeeded({ customerName: who, order }));
    }
  }
};

/** E7 — refund completed. */
const refunded = async (order) => {
  const user = await customerFor(order.userId, 'REFUNDED');
  if (!user) return;
  await deliver(user, 'REFUNDED', idStr(order), 'REFUNDED', T.refunded({ name: user.name, order }));
};

/** Return completed and refunded. */
const returnRefunded = async (ret) => {
  const user = await customerFor(ret.userId, 'RETURN_REFUNDED');
  if (!user) return;
  await deliver(user, 'RETURN_REFUNDED', idStr(ret), 'REFUNDED', T.returnRefunded({ name: user.name, ret }));
};

/** E8 / E9 — only READY_FOR_PICKUP (pickup orders) and DELIVERED are emailed. */
const orderStatus = async (order, status) => {
  if (status === 'READY_FOR_PICKUP' && order.deliveryType === 'PICKUP') {
    const user = await customerFor(order.userId, 'ORDER_READY_PICKUP');
    if (user) await deliver(user, 'ORDER_READY_PICKUP', idStr(order), status, T.readyForPickup({ name: user.name, order }));
  } else if (status === 'DELIVERED') {
    const user = await customerFor(order.userId, 'ORDER_DELIVERED');
    if (user) await deliver(user, 'ORDER_DELIVERED', idStr(order), status, T.delivered({ name: user.name, order }));
  }
};

/** E10 — wishlist product back in stock. userIds are already-filtered active customers. */
const wishlistBackInStock = async ({ userIds, productId, productName, qty, at }) => {
  if (!userIds || userIds.length === 0) return;
  const users = await User.find({ _id: { $in: userIds }, isActive: true }).select('name email').lean();
  for (const u of users) {
    try {
      await deliver(
        u,
        'WISHLIST_BACK_IN_STOCK',
        `${idStr(u)}:${productId}`,
        String(at),
        T.backInStock({ name: u.name, productId, productName, qty })
      );
    } catch (err) {
      logger.error({ err: err.message }, 'Back-in-stock email failed');
    }
  }
};

/* ---------------- admin ---------------- */

/** A1 — new order placed. */
const adminNewOrder = async (order, customerName) => {
  const admin = await adminRecipient();
  if (!admin) return;
  await deliver(admin, 'ADMIN_NEW_ORDER', idStr(order), 'PENDING', T.adminNewOrder({ customerName: customerName || 'A customer', order }));
};

const ERROR_TITLES = {
  payment: 'Payment gateway error',
  refund: 'Refund error',
  order: 'Order processing error',
  'payment-cancel': 'Payment cancellation error',
  timeout: 'Order timeout error',
};
const ORDER_ID_SCOPES = new Set(['refund', 'payment-cancel', 'timeout']);

/** A3 — gateway / refund / order-processing error. At most one email per scope+entity per hour. */
const adminError = async ({ scope, entityId, orderId, message }) => {
  const admin = await adminRecipient();
  if (!admin) return;
  const hour = new Date().toISOString().slice(0, 13);
  const linkId = ORDER_ID_SCOPES.has(scope) && /^[a-f0-9]{24}$/i.test(String(entityId || '')) ? String(entityId) : null;
  await deliver(
    admin,
    'ADMIN_ERROR',
    `${scope}:${entityId || orderId || 'n/a'}`,
    hour,
    T.adminError({
      title: ERROR_TITLES[scope] || 'Processing error',
      orderRef: orderId ? String(orderId) : '',
      orderId: linkId,
      message: String(message || 'Unknown error').slice(0, 300),
    })
  );
};

/** A4 — daily low-stock digest. `items` = [{ name, qtyOnHand, lowStockThreshold, status }]. */
const adminLowStockDigest = async (items, dayKey) => {
  if (!items || items.length === 0) return { status: 'NOTHING_TO_REPORT' };
  const admin = await adminRecipient();
  if (!admin) return { status: 'NO_RECIPIENT' };
  return deliver(admin, 'ADMIN_LOW_STOCK_DIGEST', dayKey, 'DAILY', T.lowStockDigest({ items }));
};

module.exports = {
  sendVerifyOtp,
  sendResetOtp,
  welcome,
  passwordChanged,
  orderConfirmed,
  paymentFailed,
  paymentExpired,
  orderCancelled,
  refunded,
  returnRefunded,
  orderStatus,
  wishlistBackInStock,
  adminNewOrder,
  adminError,
  adminLowStockDigest,
};
