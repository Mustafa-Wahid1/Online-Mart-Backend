'use strict';

const Contact = require('../models/Contact.model');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const emailService = require('../infrastructure/email/email.service');
const logger = require('../utils/logger');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { onContactMessage, onContactReplied } = require('./notification.triggers');

/**
 * Create a contact message and notify admin by email.
 */
const createContact = async (payload) => {
  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const phone = String(payload.phone || '').trim();
  const subject = String(payload.subject || '').trim();
  const message = String(payload.message || '').trim();

  if (!name) throw new AppError('Full name is required', 400, 'VALIDATION_ERROR');
  if (!email) throw new AppError('Email is required', 400, 'VALIDATION_ERROR');
  if (!subject) throw new AppError('Subject is required', 400, 'VALIDATION_ERROR');
  if (!message) throw new AppError('Message is required', 400, 'VALIDATION_ERROR');

  const doc = await Contact.create({
    name,
    email,
    phone,
    subject,
    message,
    status: 'NEW',
  });

  // In-app notification for admins (never throws)
  await onContactMessage(doc);

  const adminTo = env.ADMIN_EMAIL || env.MAIL_FROM_EMAIL;
  if (adminTo) {
    const html = `
      <p><strong>New contact message</strong></p>
      <p><strong>From:</strong> ${escapeHtml(name)} <${escapeHtml(email)}></p>
      ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ''}
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <p><strong>Message:</strong></p>
      <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
      <p style="color:#666;font-size:12px">ID: ${doc._id}</p>
    `;
    const result = await emailService.sendEmail({
      to: adminTo,
      toName: env.ADMIN_NAME || 'Admin',
      type: 'CONTACT_MESSAGE',
      subject: `[Contact] ${subject}`,
      html,
      text: `From: ${name} <${email}>\nPhone: ${phone}\nSubject: ${subject}\n\n${message}`,
    });
    if (result.status !== 'SENT' && result.status !== 'NOT_CONFIGURED') {
      logger.warn({ status: result.status, contactId: String(doc._id) }, 'Contact admin email not sent');
    }
  }

  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    subject: doc.subject,
    status: doc.status,
    createdAt: doc.createdAt,
  };
};

/**
 * Format a Contact document for API responses.
 */
const formatContact = (doc) => {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id),
    name: o.name,
    email: o.email,
    phone: o.phone || '',
    subject: o.subject,
    message: o.message,
    status: o.status,
    adminReply: o.adminReply || '',
    repliedAt: o.repliedAt || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
};

/**
 * Admin: list contact messages with filters + pagination.
 */
const listAdmin = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }

  const searchTerm = query.q || query.search;
  if (searchTerm && String(searchTerm).trim()) {
    const q = String(searchTerm).trim();
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { name: regex },
      { email: regex },
      { subject: regex },
      { message: regex },
    ];
  }

  const [docs, total] = await Promise.all([
    Contact.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Contact.countDocuments(filter),
  ]);

  const meta = buildMeta(total, page, limit);

  return {
    data: docs.map(formatContact),
    meta: {
      page: meta.currentPage,
      limit: meta.limit,
      total: meta.total,
      totalPages: meta.pages,
    },
  };
};

/**
 * Admin: get a single contact message by id.
 */
const getAdminById = async (id) => {
  const doc = await Contact.findById(id);
  if (!doc) throw new AppError('Message not found', 404, 'NOT_FOUND');
  return formatContact(doc);
};

/**
 * Admin: update status (NEW | READ | REPLIED | ARCHIVED).
 */
const updateStatus = async (id, status) => {
  const allowed = ['NEW', 'READ', 'REPLIED', 'ARCHIVED'];
  if (!allowed.includes(status)) {
    throw new AppError('Invalid status', 400, 'VALIDATION_ERROR');
  }

  const doc = await Contact.findById(id);
  if (!doc) throw new AppError('Message not found', 404, 'NOT_FOUND');

  doc.status = status;
  if (status === 'REPLIED' && !doc.repliedAt) {
    doc.repliedAt = new Date();
  }
  await doc.save();

  return formatContact(doc);
};

/**
 * Admin: send a reply email to the customer and mark as REPLIED.
 */
const sendReply = async (id, replyMessage) => {
  const text = String(replyMessage || '').trim();
  if (!text) throw new AppError('Reply message is required', 400, 'VALIDATION_ERROR');
  if (text.length > 5000) throw new AppError('Reply is too long', 400, 'VALIDATION_ERROR');

  const doc = await Contact.findById(id);
  if (!doc) throw new AppError('Message not found', 404, 'NOT_FOUND');

  // Use the same branded layout as other store emails (Welcome, Order, etc.)
  // so Gmail treats it the same and puts it in Inbox instead of Spam.
  const contactReplyTpl = require('../infrastructure/email/templates/contactReply');
  const tpl = contactReplyTpl({
    name: doc.name,
    subject: doc.subject,
    reply: text,
    originalMessage: doc.message,
  });

  let result = { status: 'SKIPPED' };
  try {
    result = await emailService.sendEmail({
      to: doc.email,
      toName: doc.name,
      type: 'CONTACT_REPLY',
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
  } catch (err) {
    logger.error({ err: err && err.message, contactId: String(doc._id) }, 'Contact reply email threw');
    result = { status: 'FAILED' };
  }

  // Visible in terminal so we can confirm delivery
  // eslint-disable-next-line no-console
  console.log('[CONTACT REPLY]', { to: doc.email, status: result.status, messageId: result.messageId || null });
  logger.info(
    { contactId: String(doc._id), to: doc.email, emailStatus: result.status, messageId: result.messageId },
    'Contact reply email result'
  );

  // Always save the reply
  doc.adminReply = text;
  doc.status = 'REPLIED';
  doc.repliedAt = new Date();
  await doc.save();

  // In-app notification for the customer (never throws)
  await onContactReplied(doc);

  return {
    ...formatContact(doc),
    emailStatus: result.status,
    emailError: result.status === 'FAILED' ? 'Email could not be delivered' : null,
  };
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

module.exports = {
  createContact,
  listAdmin,
  getAdminById,
  updateStatus,
  sendReply,
};
