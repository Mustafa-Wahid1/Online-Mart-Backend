'use strict';
const { render, p, url } = require('./layout');
const { firstName } = require('./format');

module.exports = ({ name }) => ({
  subject: 'Welcome to OnlineMart',
  ...render({
    preheader: 'Your email is verified — happy shopping!',
    heading: `Welcome, ${firstName(name)}!`,
    blocks: [
      p('Your email is verified and your account is ready.'),
      p('Browse fresh, organic groceries and get them delivered or ready for pickup.'),
    ],
    cta: { label: 'Start shopping', url: url('/shop') },
  }),
});
