"use strict";

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const pinoHttp = require("pino-http");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const env = require("./config/env");
const logger = require("./utils/logger");
const { globalLimiter } = require("./middlewares/rateLimit.middleware");
const {
  notFoundHandler,
  errorHandler,
} = require("./middlewares/error.middleware");
const authMiddleware = require("./middlewares/auth.middleware");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const addressRoutes = require("./routes/address.routes");
const categoryRoutes = require("./routes/category.routes");
const productRoutes = require("./routes/product.routes");
const cartRoutes = require("./routes/cart.routes");
const wishlistRoutes = require("./routes/wishlist.routes");
const orderRoutes = require("./routes/order.routes");
const paymentRoutes = require("./routes/payment.routes");
const webhookRoutes = require("./routes/webhook.routes");
const adminRoutes = require("./routes/admin.routes");
const notificationRoutes = require("./routes/notification.routes");

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  cors(
    // {
    //   origin: ["localhost:3000", "youtube.com"],
    //   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    // },
      {
      origin: (origin, callback) => {
        if (!origin || env.CORS_ORIGINS.includes(origin) || env.isDev) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }
  ),
);

app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) =>
        req.url === `/${env.URL_PREFIX}/health` || req.url === "/health",
    },
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(globalLimiter);

if (!env.isProd) {
  const swaggerOptions = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "OnlineMart API",
        version: "1.0.0",
        description: "UK-style online grocery store backend API",
      },
      servers: [{ url: `http://localhost:${env.PORT}/${env.URL_PREFIX}` }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    apis: ["./src/routes/*.js", "./src/models/*.js"],
  };
  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

const prefix = `/${env.URL_PREFIX}`;

app.use(`${prefix}/health`, healthRoutes);
app.use(`${prefix}/auth`, authRoutes);
app.use(`${prefix}/webhooks`, webhookRoutes);

app.use(authMiddleware);

app.use(`${prefix}/users`, userRoutes);
app.use(`${prefix}/addresses`, addressRoutes);
app.use(`${prefix}/categories`, categoryRoutes);
app.use(`${prefix}/products`, productRoutes);
app.use(`${prefix}/admin`, adminRoutes);
app.use(`${prefix}/cart`, cartRoutes);
app.use(`${prefix}/wishlist`, wishlistRoutes);
app.use(`${prefix}/orders`, orderRoutes);
app.use(`${prefix}/payments`, paymentRoutes);
app.use(`${prefix}/notifications`, notificationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
