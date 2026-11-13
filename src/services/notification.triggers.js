'use strict';

const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const Product = require('../models/Product.model');
const Cart = require('../models/Cart.model');
const Wishlist = require('../models/Wishlist.model');
const { notify } = require('./notification.service');
const { toString: moneyToString } = require('../utils/money');
const logger = require('../utils/logger');
const emailEvents = require('../infrastructure/email/email.events');
const { fireAndForget: mail } = require('../infrastructure/email/email.service');

/** Wraps a trigger so it can never throw into the caller. */
const safe = (name, fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    logger.error({ err: err.message, trigger: name }, 'Notification trigger failed');
    return undefined;
  }
};

const idOf = (v) => (v && v._id ? v._id : v);
const str = (v) => String(idOf(v));
const money = (v) => `$${moneyToString(v)}`;
const minuteBucket = () => new Date().toISOString().slice(0, 16);

const customerName = async (userId) => {
  const u = await User.findById(userId).select('name').lean();
  return (u && u.name) || 'A customer';
};

const orderData = (order, extra = {}) => ({
  orderId: str(order),
  orderNumber: order.orderNumber,
  status: order.status,
  ...extra,
});

/* ------------------------------------------------------------------ */
/* Customer — orders (C1)                                             */
/* ------------------------------------------------------------------ */

const ORDER_STATUS_COPY = {
  CONFIRMED: ['Order confirmed', (n) => `Your order ${n} has been confirmed.`],
  PROCESSING: ['Order is being prepared', (n) => `Your order ${n} is now being processed.`],
  READY_FOR_PICKUP: ['Ready for pickup', (n) => `Your order ${n} is ready for pickup.`],
  READY_FOR_DELIVERY: ['Ready for delivery', (n) => `Your order ${n} is ready and will be delivered soon.`],
  DELIVERED: ['Order delivered', (n) => `Your order ${n} has been delivered.`],
  CANCELLED: ['Order cancelled', (n) => `Your order ${n} has been cancelled.`],
};

const onOrderStatus = safe('onOrderStatus', async (order, status) => {
  const copy = ORDER_STATUS_COPY[status];
  if (!copy) return;
  await notify({
    userId: order.userId,
    type: 'ORDER_STATUS',
    title: copy[0],
    message: copy[1](order.orderNumber),
    data: orderData(order, { status }),
    dedupeKey: `order-status:${str(order)}:${status}`,
  });
  mail(() => emailEvents.orderStatus(order, status));
});

/* ------------------------------------------------------------------ */
/* Customer — payment window (C2, C3)                                 */
/* ------------------------------------------------------------------ */

const onPaymentReminder = safe('onPaymentReminder', async (order) => {
  const dedupeKey = `payment-reminder:${str(order)}`;
  const exists = await Notification.exists({ userId: order.userId, dedupeKey });
  if (exists) return;
  await notify({
    userId: order.userId,
    type: 'PAYMENT_REMINDER',
    title: 'Payment window closing',
    message: `1 minute left to pay for order ${order.orderNumber}, or it will be cancelled.`,
    data: orderData(order, { status: 'PENDING' }),
    dedupeKey,
  });
});

const onPaymentExpired = safe('onPaymentExpired', async (order) => {
  await notify({
    userId: order.userId,
    type: 'PAYMENT_EXPIRED',
    title: 'Payment window expired',
    message: `Order ${order.orderNumber} was cancelled because payment was not received in time. Your items are back in stock.`,
    data: orderData(order, { status: 'CANCELLED' }),
    dedupeKey: `payment-expired:${str(order)}`,
  });
  mail(() => emailEvents.paymentExpired(order));
});

/* ------------------------------------------------------------------ */
/* Payment result (C4 + A2)                                           */
/* ------------------------------------------------------------------ */

const onPaymentReceived = safe('onPaymentReceived', async (payment, order) => {
  if (!order) return;
  mail(() => emailEvents.orderConfirmed(payment, order));
  const base = orderData(order, { paymentId: str(payment), paymentStatus: 'PAID' });

  await notify({
    userId: order.userId,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment received',
    message: `We received your payment of ${money(order.total)} for order ${order.orderNumber}.`,
    data: base,
    dedupeKey: `payment-received:${str(order)}`,
  });

  await onOrderStatus(order, 'CONFIRMED');

  const name = await customerName(order.userId);
  await notify({
    role: 'ADMIN',
    type: 'ADMIN_PAYMENT_RECEIVED',
    title: 'Payment received',
    message: `${name} paid ${money(order.total)} for order ${order.orderNumber}.`,
    data: base,
    dedupeKey: `admin-payment-received:${str(order)}`,
  });
});

const onPaymentFailed = safe('onPaymentFailed', async (payment, reason) => {
  const Order = require('../models/Order.model');
  const order = await Order.findById(payment.orderId)
    .select('orderNumber userId total status paymentStatus paymentExpiresAt')
    .lean();
  const orderNumber = order ? order.orderNumber : '';
  const data = {
    orderId: str(payment.orderId),
    orderNumber,
    paymentId: str(payment),
    status: 'FAILED',
    paymentStatus: 'FAILED',
  };
  const bucket = minuteBucket();
  mail(() => emailEvents.paymentFailed(payment, order));

  await notify({
    userId: payment.userId,
    type: 'PAYMENT_FAILED',
    title: 'Payment failed',
    message: `Your payment for order ${orderNumber} did not go through. Please try again before the payment window ends.`,
    data,
    dedupeKey: `payment-failed:${str(payment)}:${bucket}`,
  });

  const name = await customerName(payment.userId);
  await notify({
    role: 'ADMIN',
    type: 'ADMIN_PAYMENT_FAILED',
    title: 'Payment failed',
    message: `Payment failed for order ${orderNumber} by ${name}${reason ? ` — ${String(reason).slice(0, 160)}` : ''}.`,
    data,
    dedupeKey: `admin-payment-failed:${str(payment)}:${bucket}`,
  });
});

/* ------------------------------------------------------------------ */
/* Orders — admin side (A1, A3)                                       */
/* ------------------------------------------------------------------ */

const onOrderPlaced = safe('onOrderPlaced', async (order) => {
  const name = await customerName(order.userId);
  await notify({
    role: 'ADMIN',
    type: 'ADMIN_NEW_ORDER',
    title: 'New order placed',
    message: `${name} placed order ${order.orderNumber} (${money(order.total)}).`,
    data: orderData(order, { status: 'PENDING' }),
    dedupeKey: `admin-new-order:${str(order)}`,
  });
  mail(() => emailEvents.adminNewOrder(order, name));
});

/**
 * Called once after a cancellation transaction has committed.
 * Covers C1 (cancelled), C3 (payment timeout), C5 (refund pending) and A3.
 */
const onOrderCancelled = safe('onOrderCancelled', async ({ order, wasPaid, cancelledBy }) => {
  const orderId = str(order);

  if (cancelledBy !== 'PAYMENT_TIMEOUT') {
    mail(() => emailEvents.orderCancelled({ order, wasPaid, cancelledBy }));
  }

  if (cancelledBy === 'PAYMENT_TIMEOUT') {
    await onPaymentExpired(order);
    return;
  }

  if (wasPaid) {
    await notify({
      userId: order.userId,
      type: 'REFUND_PENDING',
      title: 'Refund pending',
      message: `Order ${order.orderNumber} was cancelled. Your refund of ${money(order.total)} is pending.`,
      data: orderData(order, { status: 'REFUND_PENDING', paymentStatus: 'PAID' }),
      dedupeKey: `refund-pending:${orderId}`,
    });
  } else {
    await onOrderStatus(order, 'CANCELLED');
  }

  if (cancelledBy === 'CUSTOMER') {
    const name = await customerName(order.userId);
    await notify({
      role: 'ADMIN',
      type: 'ADMIN_ORDER_CANCELLED',
      title: wasPaid ? 'Order cancelled — refund needed' : 'Order cancelled by customer',
      message: wasPaid
        ? `${name} cancelled paid order ${order.orderNumber}. Refund of ${money(order.total)} is pending.`
        : `${name} cancelled order ${order.orderNumber}.`,
      data: orderData(order, { refundPending: Boolean(wasPaid) }),
      dedupeKey: `admin-order-cancelled:${orderId}`,
    });
  }
});

/* ------------------------------------------------------------------ */
/* Refund (C5)                                                        */
/* ------------------------------------------------------------------ */

const onRefunded = safe('onRefunded', async (order) => {
  await notify({
    userId: order.userId,
    type: 'REFUND_COMPLETED',
    title: 'Refund completed',
    message: `Your refund of ${money(order.total)} for order ${order.orderNumber} has been issued.`,
    data: orderData(order, { status: 'CANCELLED', paymentStatus: 'REFUNDED' }),
    dedupeKey: `refunded:${str(order)}`,
  });
  mail(() => emailEvents.refunded(order));
});

/* ------------------------------------------------------------------ */
/* Account (C8, A5)                                                   */
/* ------------------------------------------------------------------ */

const onUserRegistered = safe('onUserRegistered', async (user) => {
  const userId = str(user);
  await notify({
    userId,
    type: 'WELCOME',
    title: 'Welcome to OnlineMart',
    message: `Hi ${String(user.name || '').split(' ')[0] || 'there'}, your account is ready. Happy shopping!`,
    data: { userId },
    dedupeKey: `welcome:${userId}`,
  });
  await notify({
    role: 'ADMIN',
    type: 'ADMIN_NEW_CUSTOMER',
    title: 'New customer registered',
    message: `${user.name} (${user.email}) just created an account.`,
    data: { userId },
    dedupeKey: `admin-new-customer:${userId}`,
  });
});

const onProfileUpdated = safe('onProfileUpdated', async (user) => {
  const userId = str(user);
  await notify({
    userId,
    type: 'PROFILE_UPDATED',
    title: 'Profile updated',
    message: 'Your profile details were updated successfully.',
    data: { userId },
    dedupeKey: `profile-updated:${userId}:${Date.now()}`,
  });
});

const onAddressChanged = safe('onAddressChanged', async (userId, address, action) => {
  const label = (address && address.label) || 'Address';
  const copy = {
    added: ['Address added', `Your address "${label}" was added.`],
    updated: ['Address updated', `Your address "${label}" was updated.`],
    removed: ['Address removed', `Your address "${label}" was removed.`],
    default: ['Default address changed', `"${label}" is now your default address.`],
  }[action];
  if (!copy) return;
  await notify({
    userId,
    type: 'ADDRESS_UPDATED',
    title: copy[0],
    message: copy[1],
    data: { addressId: address && address._id ? str(address) : undefined, action },
    dedupeKey: `address:${str(userId)}:${action}:${Date.now()}`,
  });
});

/* ------------------------------------------------------------------ */
/* Returns                                                            */
/* ------------------------------------------------------------------ */

const RETURN_STATUS_COPY = {
  APPROVED: ['Return approved', (n) => `Your return request for order ${n} has been approved.`],
  REJECTED: ['Return rejected', (n) => `Your return request for order ${n} was rejected.`],
  COMPLETED: ['Return completed', (n) => `Your return for order ${n} has been completed.`],
};

const returnData = (ret, extra = {}) => ({
  returnId: str(ret),
  orderId: str(ret.orderId),
  orderNumber: ret.orderNumber,
  status: ret.status,
  ...extra,
});

/** Customer submitted a return request -> admins. */
const onReturnRequested = safe('onReturnRequested', async (ret) => {
  const name = await customerName(ret.userId);
  const count = (ret.items || []).length;
  await notify({
    role: 'ADMIN',
    type: 'ADMIN_RETURN_REQUESTED',
    title: 'New return request',
    message: `${name} requested a return for order ${ret.orderNumber} (${count} item${count === 1 ? '' : 's'}).`,
    data: returnData(ret, { status: 'PENDING' }),
    dedupeKey: `admin-return-requested:${str(ret)}`,
  });
});

/** Admin changed a return status -> customer. Skips unchanged / PENDING. */
const onReturnStatusChanged = safe('onReturnStatusChanged', async (ret, prevStatus) => {
  if (ret.status === prevStatus) return;
  const copy = RETURN_STATUS_COPY[ret.status];
  if (!copy) return;

  let message = copy[1](ret.orderNumber);
  const refunded = ret.status === 'COMPLETED' && Number(ret.refundAmount) > 0;
  if (refunded) {
    message = `Your return for order ${ret.orderNumber} is complete. A refund of ${money(ret.refundAmount)} has been issued to your original payment method.`;
    mail(() => emailEvents.returnRefunded(ret));
  }
  const notes = String(ret.adminNotes || '').trim();
  if (ret.status === 'REJECTED' && notes) message += ` Reason: ${notes.slice(0, 300)}`;

  const stamp = ret.updatedAt ? new Date(ret.updatedAt).getTime() : Date.now();
  await notify({
    userId: ret.userId,
    type: 'RETURN_STATUS',
    title: refunded ? 'Return refunded' : copy[0],
    message,
    data: returnData(ret, refunded ? { refundAmount: String(ret.refundAmount) } : {}),
    dedupeKey: `return-status:${str(ret)}:${ret.status}:${stamp}`,
  });
});

/* ------------------------------------------------------------------ */
/* Contact messages                                                   */
/* ------------------------------------------------------------------ */

/** Customer sent a contact message -> admins. */
const onContactMessage = safe('onContactMessage', async (contact) => {
  await notify({
    role: 'ADMIN',
    type: 'ADMIN_CONTACT_MESSAGE',
    title: 'New contact message',
    message: `${contact.name}: ${String(contact.subject).slice(0, 150)}`,
    data: { contactId: str(contact), status: 'NEW' },
    dedupeKey: `admin-contact-message:${str(contact)}`,
  });
});

/**
 * Admin replied (email sent) -> customer.
 * Contact form is public, so we match the sender to an account by email;
 * guests without an account only get the email.
 */
const onContactReplied = safe('onContactReplied', async (contact) => {
  const user = await User.findOne({
    email: String(contact.email || '').toLowerCase(),
    role: 'CUSTOMER',
    isActive: true,
  })
    .select('_id')
    .lean();
  if (!user) return;

  const stamp = contact.repliedAt ? new Date(contact.repliedAt).getTime() : Date.now();
  await notify({
    userId: user._id,
    type: 'CONTACT_REPLIED',
    title: 'We replied to your message',
    message: `Our reply to "${String(contact.subject).slice(0, 120)}" has been sent to your email.`,
    data: { contactId: str(contact), status: 'REPLIED' },
    dedupeKey: `contact-replied:${str(contact)}:${stamp}`,
  });
});

/* ------------------------------------------------------------------ */
/* System errors (A6)                                                 */
/* ------------------------------------------------------------------ */

const onProcessingError = safe('onProcessingError', async ({ scope, entityId, orderId, message }) => {
  const titles = {
    payment: 'Payment gateway error',
    refund: 'Refund error',
    order: 'Order processing error',
    'payment-cancel': 'Payment cancellation error',
    timeout: 'Order timeout error',
  };
  const detail = String(message || 'Unknown error').slice(0, 200);
  await notify({
    role: 'ADMIN',
    type: 'ADMIN_SYSTEM_ERROR',
    title: titles[scope] || 'Processing error',
    message: orderId ? `Order ${orderId}: ${detail}` : detail,
    data: { scope, orderId: orderId ? String(orderId) : undefined },
    dedupeKey: `error:${scope}:${entityId || orderId || 'n/a'}:${minuteBucket()}`,
  });
  mail(() => emailEvents.adminError({ scope, entityId, orderId, message }));
});

/* ------------------------------------------------------------------ */
/* Stock transitions (A4, C6, C7)                                     */
/* ------------------------------------------------------------------ */

const statusFor = (qty, threshold) => {
  if (qty <= 0) return 'OUT_OF_STOCK';
  if (qty <= threshold) return 'LOW_STOCK';
  return 'IN_STOCK';
};

/** Builds a change record from an inventory doc that was just modified (not yet notified). */
const describeStockChange = (inventory, { qtyBefore, thresholdBefore }) => {
  const threshold = thresholdBefore !== undefined ? thresholdBefore : inventory.lowStockThreshold;
  return {
    productId: str(inventory.productId),
    from: statusFor(qtyBefore, threshold),
    to: inventory.status,
    qty: inventory.qtyOnHand,
    at: (inventory.updatedAt ? new Date(inventory.updatedAt) : new Date()).getTime(),
  };
};

const pending = new WeakMap(); // session -> Map(productId -> change)

const queueStockChange = (session, inventory, before) => {
  try {
    if (!session) return;
    const change = describeStockChange(inventory, before);
    let bucket = pending.get(session);
    if (!bucket) {
      bucket = new Map();
      pending.set(session, bucket);
    }
    const prev = bucket.get(change.productId);
    bucket.set(change.productId, prev ? { ...change, from: prev.from } : change);
  } catch (err) {
    logger.error({ err: err.message }, 'Queueing stock change failed');
  }
};

const activeCustomerIds = async (ids) => {
  if (ids.length === 0) return [];
  const users = await User.find({ _id: { $in: ids }, role: 'CUSTOMER', isActive: true })
    .select('_id')
    .lean();
  return users.map((u) => u._id.toString());
};

const handleStockChange = async (change) => {
  const { productId, from, to, qty, at } = change;
  if (from === to) return;

  const becameOut = to === 'OUT_OF_STOCK' && from !== 'OUT_OF_STOCK';
  const becameLow = to === 'LOW_STOCK' && from === 'IN_STOCK';
  const backInStock = from === 'OUT_OF_STOCK' && to !== 'OUT_OF_STOCK';
  if (!becameOut && !becameLow && !backInStock) return;

  const product = await Product.findById(productId).select('name isActive').lean();
  if (!product) return;
  const name = product.name;
  const data = { productId, productName: name, status: to, qtyOnHand: qty };
  const keyBase = `${productId}:${to}:${at}`;

  // A4 — admins
  if (becameOut || becameLow) {
    await notify({
      role: 'ADMIN',
      type: becameOut ? 'ADMIN_OUT_OF_STOCK' : 'ADMIN_LOW_STOCK',
      title: becameOut ? 'Product out of stock' : 'Product low on stock',
      message: becameOut
        ? `${name} is now out of stock.`
        : `${name} is running low (${qty} left).`,
      data,
      dedupeKey: `admin-stock:${keyBase}`,
    });
  }

  if (!product.isActive) return;

  // C7 — customers with the product in their cart
  if (becameOut || becameLow) {
    const carts = await Cart.find({ 'items.productId': productId }).select('userId').lean();
    const ids = await activeCustomerIds(carts.map((c) => c.userId.toString()));
    if (ids.length) {
      await notify({
        userIds: ids,
        type: becameOut ? 'CART_OUT_OF_STOCK' : 'CART_LOW_STOCK',
        title: becameOut ? 'Item in your cart is sold out' : 'Item in your cart is running low',
        message: becameOut
          ? `${name} in your cart is now out of stock.`
          : `Only ${qty} left of ${name} in your cart.`,
        data,
        dedupeKey: `cart-stock:${keyBase}`,
      });
    }
  }

  // C6 — customers with the product in their wishlist
  if (backInStock || becameLow) {
    const lists = await Wishlist.find({ 'items.productId': productId }).select('userId').lean();
    const ids = await activeCustomerIds(lists.map((w) => w.userId.toString()));
    if (ids.length && backInStock) {
      mail(() => emailEvents.wishlistBackInStock({ userIds: ids, productId, productName: name, qty, at }));
    }
    if (ids.length) {
      await notify({
        userIds: ids,
        type: backInStock ? 'WISHLIST_BACK_IN_STOCK' : 'WISHLIST_LOW_STOCK',
        title: backInStock ? 'Wishlist item is back in stock' : 'Wishlist item is running low',
        message: backInStock
          ? `${name} is back in stock${to === 'LOW_STOCK' ? ` (only ${qty} left)` : ''}.`
          : `Only ${qty} left of ${name} from your wishlist.`,
        data,
        dedupeKey: `wishlist-stock:${keyBase}`,
      });
    }
  }
};

const onStockChanges = safe('onStockChanges', async (changes) => {
  for (const change of changes) {
    try {
      await handleStockChange(change);
    } catch (err) {
      logger.error({ err: err.message, productId: change.productId }, 'Stock notification failed');
    }
  }
});

/** Call AFTER the transaction that queued changes has committed. */
const flushStockChanges = safe('flushStockChanges', async (session) => {
  const bucket = pending.get(session);
  if (!bucket) return;
  pending.delete(session);
  await onStockChanges([...bucket.values()]);
});

module.exports = {
  statusFor,
  describeStockChange,
  queueStockChange,
  flushStockChanges,
  onStockChanges,
  onOrderStatus,
  onOrderPlaced,
  onOrderCancelled,
  onPaymentReminder,
  onPaymentExpired,
  onPaymentReceived,
  onPaymentFailed,
  onRefunded,
  onUserRegistered,
  onProfileUpdated,
  onAddressChanged,
  onProcessingError,
  onReturnRequested,
  onReturnStatusChanged,
  onContactMessage,
  onContactReplied,
};
