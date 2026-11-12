'use strict';
const { render, p, callout, kv } = require('./layout');
const { firstName, fmtDate } = require('./format');

module.exports = ({ name, changedAt }) => ({
  subject: 'Your OnlineMart password was changed',
  ...render({
    preheader: 'Your password was just changed.',
    heading: 'Your password was changed',
    blocks: [
      p(`Hi ${firstName(name)}, the password for your OnlineMart account was changed.`),
      kv([['When', fmtDate(changedAt)]]),
      callout('If this was not you, reset your password immediately and contact support.', 'warn'),
    ],
    footerNote: 'This is a security notification about your OnlineMart account.',
  }),
});
