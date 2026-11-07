'use strict';
const { render, p, otpBox } = require('./layout');
const { firstName } = require('./format');

module.exports = ({ name, code, expiresMinutes }) => {
  const subject = 'Verify your email — OnlineMart';
  return {
    subject,
    ...render({
      preheader: 'Use this code to verify your email address.',
      heading: 'Verify your email',
      blocks: [
        p(`Hi ${firstName(name)}, welcome to OnlineMart! Enter this code to verify your email address:`),
        otpBox(code),
        p(`This code expires in ${expiresMinutes} minutes.`),
        p('If you did not request this, ignore this email.'),
      ],
      footerNote: 'Never share this code with anyone. OnlineMart will never ask you for it.',
    }),
  };
};
