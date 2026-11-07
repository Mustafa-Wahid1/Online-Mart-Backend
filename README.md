# OnlineMart Backend

Production-ready Node.js backend for **OnlineMart**, a UK-style online grocery store (currency GBP).

**Stack:** Express · MongoDB 7 · Mongoose · JWT · bcryptjs · express-validator · helmet · cors · express-rate-limit · node-cron · dotenv · swagger · pino · Jest + Supertest · mock payment gateway

## Quick Start

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET (≥32 chars) and PAYMENT_WEBHOOK_SECRET (≥16 chars)

npm install

# MongoDB must be running (local or Atlas URI in MONGODB_URI)

npm run seed   # creates the single ADMIN user
npm run dev    # starts on PORT (default 3000)
```

- Health: `GET /v1/health`
- Swagger (non-prod): `http://localhost:3000/api-docs`

## Environment

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | yes | `development` \| `test` \| `production` |
| `PORT` | yes | default 3000 |
| `URL_PREFIX` | yes | e.g. `v1` |
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | **min 32 characters** — process exits if shorter |
| `JWT_EXPIRES_IN` | yes | e.g. `1d` |
| `BCRYPT_COST` | yes | `12` in production |
| `CORS_ORIGINS` | yes | comma-separated allow-list |
| `PAYMENT_WEBHOOK_SECRET` | yes | **min 16 characters** |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | for seed | used by `npm run seed` |

Missing or short secrets → **fail-fast exit on boot**.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Nodemon development |
| `npm start` | Production start |
| `npm run seed` | Seed single ADMIN |
| `npm test` | Jest + Supertest (real MongoDB test DB) |

## Project Structure

```
online-mart-backend/
├── .env.example
├── package.json
├── jest.config.js
├── src/
│   ├── server.js              # boot, crons, graceful shutdown
│   ├── app.js                 # Express app, middleware, routes
│   ├── config/                # env (fail-fast), database
│   ├── middlewares/           # JWT (deny-by-default), roles, validate, rateLimit, errors
│   ├── models/                # User, Address, Category, Product, Inventory, …
│   ├── routes/ + controllers/
│   ├── services/              # all business logic
│   │   ├── order/             # creation, query, status, cancellation
│   │   └── payment/           # initiate, webhook, refund
│   ├── infrastructure/payment/ # mockPayment.gateway.js
│   ├── jobs/                  # paymentTimeout.cron, refundRetry.cron
│   └── utils/                 # money, pagination, response, logger, AppError
└── tests/                     # critical-flow e2e tests
```

## Security Rules Enforced

- Global JWT; public only: health, auth register/login, catalog (GET products/categories), payment webhook
- Role always loaded from **DB** (not token)
- Ownership violations → **404** (never 403)
- Rate limits: 150/min global · 10/min auth · 20/min orders/cancels · 5/min payment initiate
- Money always returned as strings `"12.50"`
- `passwordHash` never serialized
- Exactly one ADMIN via partial unique index on `{ role: 'ADMIN' }`
- 500 responses never include stack traces
- Consistent error shape: `{ statusCode, message, error }`

## Critical Business Rules

1. **Register** — always `CUSTOMER`; `role` in body → 400
2. **Login** — identical 401 for unknown email / wrong password (timing-safe dummy bcrypt)
3. **Order create** — single transaction: stock deduct + CONSUMED ledger + order + clear cart; order number `ORD-YYYY-######`
4. **Payment webhook** — HMAC-SHA256 verified; success → payment PAID + order CONFIRMED + user stats
5. **Payment timeout cron** (every minute, max 50) — PENDING + expired → cancel + restore stock
6. **Paid cancel** → `REFUND_PENDING` → refund → `CANCELLED` + `totalSpent` restored
7. **Refund retry cron** (every 5 minutes) — processes `REFUND_PENDING` orders
8. Public catalog never returns inactive products; inactive detail → 404

## API Surface (under `/v1`)

| Method | Path | Access |
|--------|------|--------|
| GET | `/health` | Public |
| POST | `/auth/register`, `/auth/login` | Public |
| GET | `/auth/me` | Auth |
| GET/PATCH/DELETE | `/users/me`, `/users/me/stats` | Customer |
| CRUD | `/addresses` | Customer |
| GET | `/categories`, `/products`, `/products/:id` | Public |
| Admin | `/admin/categories`, `/admin/products`, `/admin/inventory`, `/admin/orders`, `/admin/customers` | Admin |
| Cart | `/cart`, `/cart/items` | Customer |
| Orders | `/orders`, `/orders/me`, `/orders/me/:id`, `/orders/me/:id/cancel` | Customer |
| Payments | `/payments/initiate`, `/payments/:id/mock-complete` | Customer |
| Webhook | `/webhooks/payments/mock` | Public (signed) |

List endpoints return `{ data, meta: { total, currentPage, limit, pages, hasNextPage, hasPrevPage } }`.

## Tests

```bash
# Requires MongoDB reachable at MONGODB_URI (or MONGODB_URI_TEST)
NODE_ENV=test npm test
```

Critical flows covered:

- Health
- Register (no role) / duplicate email 409 / login 401 parity
- Deactivated user → 403
- Exactly one ADMIN (partial unique index)
- Public catalog hides inactive products
- Empty cart → 400
- Atomic order creation (stock + cart clear)
- Ownership → 404
- Payment initiate + mock-complete → CONFIRMED/PAID
- Already cancelled → 200 with exact message

## Implementation Status

- [x] Phase 1 — Setup, env, DB, error handler, health, swagger
- [x] Phase 2 — Auth + User + JWT middleware + seed admin
- [x] Phase 3 — Addresses
- [x] Phase 4 — Categories
- [x] Phase 5 — Products
- [x] Phase 6 — Inventory
- [x] Phase 7 — Cart
- [x] Phase 8 — Orders (creation + status + cancellation)
- [x] Phase 9 — Payments (gateway + webhook + refund)
- [x] Phase 10 — Crons (payment timeout + refund retry)
- [x] Phase 11 — README + basic e2e tests for critical flows

## Definition of Done Checklist

- [x] Exactly one ADMIN enforced
- [x] Register always CUSTOMER; role in body → 400
- [x] Deactivated user’s old token → 403
- [x] Public catalog never returns inactive products
- [x] Order creation is atomic (stock + ledger + cart clear)
- [x] Payment timeout restores stock
- [x] Paid cancel → REFUND_PENDING → CANCELLED with totalSpent restored
- [x] Webhook signature verified; duplicates have one effect
- [x] passwordHash never in response
- [x] Ownership → 404
- [x] Money as strings
- [x] README with setup instructions
