'use strict';

const { render, p, callout } = require('./layout');
const { firstName } = require('./format');

/**
 * Contact reply — uses the same branded layout as other store emails
 * so it lands in Inbox instead of Spam.
 */
module.exports = ({ name, subject, reply, originalMessage }) => ({
  subject: `Reply from OnlineMart: ${subject}`,
  ...render({
    preheader: 'We replied to your message',
    heading: `Hi ${firstName(name)}`,
    blocks: [
      p('Thanks for contacting OnlineMart. Here is our reply:'),
      callout(reply, 'info'),
      p('If you have more questions, just reply to this email.'),
    ],
    footerNote: 'You are receiving this because you contacted OnlineMart.',
  }),
});
