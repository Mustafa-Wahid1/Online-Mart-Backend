'use strict';

const Faq = require('../models/Faq.model');
const AppError = require('../utils/AppError');
const { parsePagination, buildMeta } = require('../utils/pagination');

const CATEGORIES = ['Orders', 'Shipping', 'Payments', 'Returns', 'Account'];

const formatFaq = (f) => ({
  id: String(f._id),
  question: f.question,
  answer: f.answer,
  category: f.category,
  order: f.order,
  isActive: f.isActive,
  createdAt: f.createdAt,
  updatedAt: f.updatedAt,
});

/**
 * Public: list active FAQs.
 */
const listFaqs = async (query = {}) => {
  const filter = { isActive: true };
  if (query.category) {
    filter.category = String(query.category).trim();
  }
  if (query.q) {
    const q = String(query.q).trim();
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ question: regex }, { answer: regex }];
    }
  }

  const rows = await Faq.find(filter).sort({ category: 1, order: 1, createdAt: 1 }).lean();
  return rows.map(formatFaq);
};

/**
 * Admin: list all FAQs (including inactive) with pagination.
 */
const listAdmin = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.category && query.category !== 'ALL') {
    filter.category = String(query.category).trim();
  }

  const searchTerm = query.q || query.search;
  if (searchTerm && String(searchTerm).trim()) {
    const q = String(searchTerm).trim();
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ question: regex }, { answer: regex }];
  }

  const [docs, total] = await Promise.all([
    Faq.find(filter).sort({ category: 1, order: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Faq.countDocuments(filter),
  ]);

  const meta = buildMeta(total, page, limit);

  return {
    data: docs.map(formatFaq),
    meta: {
      page: meta.currentPage,
      limit: meta.limit,
      total: meta.total,
      totalPages: meta.pages,
    },
  };
};

const getAdminById = async (id) => {
  const doc = await Faq.findById(id);
  if (!doc) throw new AppError('FAQ not found', 404, 'NOT_FOUND');
  return formatFaq(doc);
};

const create = async (payload) => {
  const question = String(payload.question || '').trim();
  const answer = String(payload.answer || '').trim();
  const category = String(payload.category || '').trim();
  const order = Number(payload.order) || 0;
  const isActive = payload.isActive !== false;

  if (!question) throw new AppError('Question is required', 400, 'VALIDATION_ERROR');
  if (!answer) throw new AppError('Answer is required', 400, 'VALIDATION_ERROR');
  if (!CATEGORIES.includes(category)) {
    throw new AppError('Invalid category', 400, 'VALIDATION_ERROR');
  }

  const doc = await Faq.create({ question, answer, category, order, isActive });
  return formatFaq(doc);
};

const update = async (id, payload) => {
  const doc = await Faq.findById(id);
  if (!doc) throw new AppError('FAQ not found', 404, 'NOT_FOUND');

  if (payload.question !== undefined) doc.question = String(payload.question).trim();
  if (payload.answer !== undefined) doc.answer = String(payload.answer).trim();
  if (payload.category !== undefined) {
    if (!CATEGORIES.includes(payload.category)) {
      throw new AppError('Invalid category', 400, 'VALIDATION_ERROR');
    }
    doc.category = payload.category;
  }
  if (payload.order !== undefined) doc.order = Number(payload.order) || 0;
  if (payload.isActive !== undefined) doc.isActive = Boolean(payload.isActive);

  await doc.save();
  return formatFaq(doc);
};

const remove = async (id) => {
  const doc = await Faq.findByIdAndDelete(id);
  if (!doc) throw new AppError('FAQ not found', 404, 'NOT_FOUND');
  return { id: String(id) };
};

const toggle = async (id) => {
  const doc = await Faq.findById(id);
  if (!doc) throw new AppError('FAQ not found', 404, 'NOT_FOUND');
  doc.isActive = !doc.isActive;
  await doc.save();
  return formatFaq(doc);
};

module.exports = {
  listFaqs,
  listAdmin,
  getAdminById,
  create,
  update,
  remove,
  toggle,
};
