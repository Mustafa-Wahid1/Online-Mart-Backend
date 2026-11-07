'use strict';

const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const env = require('../config/env');
const logger = require('../utils/logger');
const User = require('../models/User.model');

let io = null;

const userRoom = (userId) => `user:${String(userId)}`;

const originCheck = (origin, callback) => {
  if (!origin || env.CORS_ORIGINS.includes(origin) || env.isDev) {
    return callback(null, true);
  }
  return callback(new Error('Not allowed by CORS'));
};

const extractToken = (socket) => {
  const fromAuth = socket.handshake.auth && socket.handshake.auth.token;
  if (fromAuth) return String(fromAuth);
  const header = socket.handshake.headers && socket.handshake.headers.authorization;
  if (header) {
    const parts = String(header).split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
  }
  return null;
};

const initSocket = (httpServer) => {
  if (io) return io;

  io = new Server(httpServer, {
    cors: { origin: originCheck, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) return next(new Error('Unauthorized'));

      const decoded = jwt.verify(token, env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('role isActive');
      if (!user || !user.isActive) return next(new Error('Unauthorized'));

      socket.data.user = { id: user._id.toString(), role: user.role };
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.data.user;
    socket.join(userRoom(id));
    if (role === 'ADMIN') socket.join('admins');
    logger.debug({ userId: id, role }, 'Socket connected');
  });

  logger.info('Socket.IO attached to HTTP server');
  return io;
};

const emitToUser = (userId, event, payload) => {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
};

const closeSocket = () => {
  if (!io) return;
  io.disconnectSockets(true);
};

module.exports = { initSocket, emitToUser, closeSocket, userRoom };
