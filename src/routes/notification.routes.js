'use strict';

const express = require('express');
const { param } = require('express-validator');
const router = express.Router();

const notificationController = require('../controllers/notification.controller');
const validate = require('../middlewares/validate.middleware');

router.get('/', notificationController.list);

router.get('/unread-count', notificationController.unreadCount);

router.patch('/read-all', notificationController.markAllRead);

router.patch(
  '/:id/read',
  [param('id').isMongoId().withMessage('Invalid notification id')],
  validate,
  notificationController.markRead
);

module.exports = router;
