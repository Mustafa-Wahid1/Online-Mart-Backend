'use strict';

/**
 * Sends a test email so you can verify the Brevo SMTP setup.
 * Usage: node src/scripts/testEmail.js you@example.com
 */
require('dotenv').config();
const env = require('../config/env');
const mailer = require('../infrastructure/email/mailer');
const { render, p, kv, callout } = require('../infrastructure/email/templates/layout');
const { fmtDate } = require('../infrastructure/email/templates/format');

const main = async () => {
  const to = process.argv[2];
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    console.error('Usage: node src/scripts/testEmail.js you@example.com');
    process.exit(1);
  }

  if (!mailer.isConfigured()) {
    console.error('Email is not configured. Set SMTP_USER, SMTP_PASS and MAIL_FROM_EMAIL (and MAIL_ENABLED=true) in .env.');
    process.exit(1);
  }

  console.log(`SMTP host: ${env.SMTP_HOST}:${env.SMTP_PORT}`);
  console.log(`From:      ${env.MAIL_FROM_NAME} <${env.MAIL_FROM_EMAIL}>`);
  console.log(`To:        ${to}`);

  const ok = await mailer.verifyConnection();
  if (!ok) console.warn('SMTP verify failed (see log above). Trying to send anyway...');

  const { html, text } = render({
    preheader: 'Your Brevo SMTP setup works.',
    heading: 'Test email',
    blocks: [
      p('If you can read this, OnlineMart can send email through Brevo.'),
      kv([
        ['Sent at', fmtDate(new Date())],
        ['SMTP host', env.SMTP_HOST],
        ['Sender', env.MAIL_FROM_EMAIL],
        ['Time zone', mailer.getTimezone()],
      ]),
      callout('Not in your inbox? Check spam, and make sure the sender is verified in Brevo.', 'info'),
    ],
  });

  try {
    const { messageId } = await mailer.send({ to, subject: 'OnlineMart test email', html, text });
    console.log(`Sent. Message id: ${messageId}`);
    process.exit(0);
  } catch (err) {
    console.error('Send failed:', err.code || err.responseCode || '', err.message);
    if (err.code === 'EAUTH') {
      console.error('Authentication failed: SMTP_USER is your Brevo SMTP login and SMTP_PASS is the SMTP key (not the REST API key).');
    }
    process.exit(1);
  }
};

main();
