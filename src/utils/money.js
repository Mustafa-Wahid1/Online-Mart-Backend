'use strict';

/**
 * Money utilities — always treat money as integer minor units internally where possible,
 * but store as Number with 2 decimals and return as string "12.50".
 * Never use floating-point arithmetic for money.
 */

const toMinor = (amount) => {
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (Number.isNaN(n)) throw new Error('Invalid money value');
  return Math.round(n * 100);
};

const fromMinor = (minor) => {
  const n = Number(minor);
  if (Number.isNaN(n)) throw new Error('Invalid minor units');
  return (n / 100).toFixed(2);
};

const toString = (amount) => {
  if (amount === null || amount === undefined) return null;
  if (typeof amount === 'string') {
    const n = parseFloat(amount);
    if (Number.isNaN(n)) throw new Error('Invalid money string');
    return n.toFixed(2);
  }
  const n = Number(amount);
  if (Number.isNaN(n)) throw new Error('Invalid money value');
  return n.toFixed(2);
};

const add = (a, b) => fromMinor(toMinor(a) + toMinor(b));

const subtract = (a, b) => fromMinor(toMinor(a) - toMinor(b));

const multiply = (amount, qty) => {
  const minor = toMinor(amount) * Number(qty);
  return fromMinor(minor);
};

const isValidPrice = (value) => {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (Number.isNaN(n) || n < 0.01) return false;
  const str = n.toFixed(2);
  return parseFloat(str) === n || Math.abs(n - parseFloat(str)) < 1e-9;
};

const round2 = (value) => {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Math.round(n * 100) / 100;
};

module.exports = {
  toMinor,
  fromMinor,
  toString,
  add,
  subtract,
  multiply,
  isValidPrice,
  round2,
};
