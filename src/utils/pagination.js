'use strict';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parsePagination = (query = {}) => {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (Number.isNaN(page) || page < 1) page = 1;
  if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const buildMeta = (total, page, limit) => {
  const pages = Math.ceil(total / limit) || 0;
  return {
    total,
    currentPage: page,
    limit,
    pages,
    hasNextPage: page < pages,
    hasPrevPage: page > 1,
  };
};

module.exports = {
  parsePagination,
  buildMeta,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
