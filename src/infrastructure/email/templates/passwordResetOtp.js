'use strict';
const { render, p, otpBox } = require('./layout');
const { firstName } = require('./format');

module.exports = ({ name, code, expiresMinutes }) => ({
  subject: 'Your password reset code — OnlineMart',
  ...render({
    preheader: 'Use this code to reset your password.',
    heading: 'Reset your password',
    blocks: [
      p(`Hi ${firstName(name)}, use this code to reset your OnlineMart password:`),
      otpBox(code),
      p(`This code expires in ${expiresMinutes} minutes and can only be used once.`),
      p('If you did not request this, ignore this email.'),
    ],
    footerNote: 'Never share this code with anyone. OnlineMart will never ask you for it.',
  }),
});
