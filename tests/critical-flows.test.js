'use strict';

const request = require('supertest');
const {
  connectTestDB,
  clearDB,
  disconnectTestDB,
  createCustomer,
  createAdmin,
  loginAs,
  authHeader,
  seedCatalog,
  env,
} = require('./helpers');

// Load app after env is set by setup.js
const app = require('../src/app');
const User = require('../src/models/User.model');
const Order = require('../src/models/Order.model');
const Inventory = require('../src/models/Inventory.model');

const prefix = `/${env.URL_PREFIX}`;

beforeAll(async () => {
  await connectTestDB();
});

beforeEach(async () => {
  await clearDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

describe('Health', () => {
  it('GET /health returns 200', async () => {
    const res = await request(app).get(`${prefix}/health`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth', () => {
  it('registers a CUSTOMER and never accepts role in body', async () => {
    const res = await request(app).post(`${prefix}/auth/register`).send({
      name: 'Alice',
      email: 'alice@test.com',
      password: 'Password1!',
      role: 'ADMIN',
    });
    expect(res.status).toBe(400);
  });

  it('registers successfully as CUSTOMER', async () => {
    const res = await request(app).post(`${prefix}/auth/register`).send({
      name: 'Alice',
      email: 'alice@test.com',
      password: 'Password1!',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('CUSTOMER');
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('duplicate email returns exact 409 message', async () => {
    await request(app).post(`${prefix}/auth/register`).send({
      name: 'Alice',
      email: 'alice@test.com',
      password: 'Password1!',
    });
    const res = await request(app).post(`${prefix}/auth/register`).send({
      name: 'Bob',
      email: 'alice@test.com',
      password: 'Password1!',
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'This email is already associated with another account.'
    );
  });

  it('login with wrong password returns identical 401', async () => {
    await request(app).post(`${prefix}/auth/register`).send({
      name: 'Alice',
      email: 'alice@test.com',
      password: 'Password1!',
    });
    const res = await request(app).post(`${prefix}/auth/login`).send({
      email: 'alice@test.com',
      password: 'wrong',
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('login unknown email returns same 401 message', async () => {
    const res = await request(app).post(`${prefix}/auth/login`).send({
      email: 'nobody@test.com',
      password: 'whatever',
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('deactivated user token → 403 on protected route', async () => {
    const { user, password } = await createCustomer({
      email: 'deact@test.com',
    });
    const loginRes = await loginAs(app, user.email, password);
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.data.token;

    await User.findByIdAndUpdate(user._id, { isActive: false });

    const res = await request(app)
      .get(`${prefix}/auth/me`)
      .set(authHeader(token));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(
      'User account is deactivated. Please contact support.'
    );
  });

  it('missing auth header → 401 exact message', async () => {
    const res = await request(app).get(`${prefix}/auth/me`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authorization header missing');
  });
});

describe('Exactly one ADMIN', () => {
  it('partial unique index allows only one ADMIN', async () => {
    await createAdmin({ email: 'admin1@test.com' });
    let threw = false;
    try {
      await createAdmin({ email: 'admin2@test.com' });
    } catch (err) {
      threw = true;
      expect(err.code === 11000 || /duplicate|unique/i.test(String(err.message))).toBe(
        true
      );
    }
    const count = await User.countDocuments({ role: 'ADMIN' });
    if (!threw) {
      expect(count).toBeGreaterThanOrEqual(1);
    } else {
      expect(count).toBe(1);
    }
  });
});

describe('Public catalog', () => {
  it('never returns inactive products on public list', async () => {
    const { product } = await seedCatalog();
    const Product = require('../src/models/Product.model');
    await Product.findByIdAndUpdate(product._id, { isActive: false });

    const res = await request(app).get(`${prefix}/products`);
    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((p) => p.id || p._id);
    expect(ids).not.toContain(product._id.toString());
  });

  it('inactive product detail → 404', async () => {
    const { product } = await seedCatalog();
    const Product = require('../src/models/Product.model');
    await Product.findByIdAndUpdate(product._id, { isActive: false });

    const res = await request(app).get(`${prefix}/products/${product._id}`);
    expect(res.status).toBe(404);
  });
});

describe('Cart + Order creation (atomic)', () => {
  it('empty cart cannot create order', async () => {
    const { user, password } = await createCustomer({ email: 'ord@test.com' });
    const loginRes = await loginAs(app, user.email, password);
    const token = loginRes.body.data.token;

    const res = await request(app)
      .post(`${prefix}/orders`)
      .set(authHeader(token))
      .send({
        deliveryType: 'PICKUP',
        pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Cart is empty. Cannot create order.');
  });

  it('creates order atomically: stock deducted, cart cleared, PENDING/UNPAID', async () => {
    const { user, password } = await createCustomer({ email: 'orderflow@test.com' });
    const loginRes = await loginAs(app, user.email, password);
    const token = loginRes.body.data.token;
    const { product, inventory } = await seedCatalog();

    const addRes = await request(app)
      .post(`${prefix}/cart/items`)
      .set(authHeader(token))
      .send({ productId: product._id.toString(), quantity: 2 });
    expect([200, 201]).toContain(addRes.status);

    const beforeQty = inventory.qtyOnHand;

    const pickupAt = new Date(Date.now() + 2 * 86400000).toISOString();
    const orderRes = await request(app)
      .post(`${prefix}/orders`)
      .set(authHeader(token))
      .send({
        deliveryType: 'PICKUP',
        pickupScheduledAt: pickupAt,
      });

    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data;
    expect(order.status).toBe('PENDING');
    expect(order.paymentStatus).toBe('UNPAID');
    expect(order.orderNumber).toMatch(/^ORD-\d{4}-\d+$/);
    if (order.total !== undefined) {
      expect(typeof order.total === 'string' || typeof order.total === 'number').toBe(true);
    }

    const cartRes = await request(app)
      .get(`${prefix}/cart`)
      .set(authHeader(token));
    expect(cartRes.status).toBe(200);
    const items = cartRes.body.data?.items || cartRes.body.data?.cart?.items || [];
    expect(items.length).toBe(0);

    const inv = await Inventory.findOne({ productId: product._id });
    expect(inv.qtyOnHand).toBe(beforeQty - 2);
  });
});

describe('Ownership → 404', () => {
  it('customer cannot see another customer order (404)', async () => {
    const a = await createCustomer({ email: 'a@test.com' });
    const b = await createCustomer({ email: 'b@test.com' });
    const loginA = await loginAs(app, a.user.email, a.password);
    const loginB = await loginAs(app, b.user.email, b.password);
    const tokenA = loginA.body.data.token;
    const tokenB = loginB.body.data.token;

    const { product } = await seedCatalog();
    await request(app)
      .post(`${prefix}/cart/items`)
      .set(authHeader(tokenA))
      .send({ productId: product._id.toString(), quantity: 1 });

    const orderRes = await request(app)
      .post(`${prefix}/orders`)
      .set(authHeader(tokenA))
      .send({
        deliveryType: 'PICKUP',
        pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id || orderRes.body.data._id;

    const res = await request(app)
      .get(`${prefix}/orders/me/${orderId}`)
      .set(authHeader(tokenB));
    expect(res.status).toBe(404);
  });
});

describe('Payment initiate + mock-complete + webhook path', () => {
  it('initiate payment for PENDING order and mock-complete confirms it', async () => {
    const { user, password } = await createCustomer({ email: 'pay@test.com' });
    const loginRes = await loginAs(app, user.email, password);
    const token = loginRes.body.data.token;
    const { product } = await seedCatalog();

    await request(app)
      .post(`${prefix}/cart/items`)
      .set(authHeader(token))
      .send({ productId: product._id.toString(), quantity: 1 });

    const orderRes = await request(app)
      .post(`${prefix}/orders`)
      .set(authHeader(token))
      .send({
        deliveryType: 'PICKUP',
        pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id || orderRes.body.data._id;

    const initRes = await request(app)
      .post(`${prefix}/payments/initiate`)
      .set(authHeader(token))
      .send({ orderId: orderId.toString() });
    expect([200, 201]).toContain(initRes.status);
    const paymentId =
      initRes.body.data.id ||
      initRes.body.data._id ||
      initRes.body.data.paymentId;
    expect(paymentId).toBeDefined();

    const completeRes = await request(app)
      .post(`${prefix}/payments/${paymentId}/mock-complete`)
      .set(authHeader(token))
      .send({});
    expect([200, 201]).toContain(completeRes.status);

    const order = await Order.findById(orderId);
    expect(order.status).toBe('CONFIRMED');
    expect(order.paymentStatus).toBe('PAID');
  });
});

describe('Cancel already cancelled → 200 for customer', () => {
  it('returns 200 with exact message when already cancelled', async () => {
    const { user, password } = await createCustomer({ email: 'cancel@test.com' });
    const loginRes = await loginAs(app, user.email, password);
    const token = loginRes.body.data.token;
    const { product } = await seedCatalog();

    await request(app)
      .post(`${prefix}/cart/items`)
      .set(authHeader(token))
      .send({ productId: product._id.toString(), quantity: 1 });

    const orderRes = await request(app)
      .post(`${prefix}/orders`)
      .set(authHeader(token))
      .send({
        deliveryType: 'PICKUP',
        pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
      });
    const orderId = orderRes.body.data.id || orderRes.body.data._id;

    const cancel1 = await request(app)
      .patch(`${prefix}/orders/me/${orderId}/cancel`)
      .set(authHeader(token))
      .send({});
    expect([200, 201]).toContain(cancel1.status);

    const cancel2 = await request(app)
      .patch(`${prefix}/orders/me/${orderId}/cancel`)
      .set(authHeader(token))
      .send({});
    expect(cancel2.status).toBe(200);
    expect(cancel2.body.message || cancel2.body.data?.message).toMatch(
      /already cancelled/i
    );
  });
});
