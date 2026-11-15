'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { latestReportUrl, statusFromText } = require('./nba-availability');

test('uses the latest official NBA PDF link and never guesses a report', () => {
  const a = 'https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-11-14_06_30PM.pdf';
  const b = 'https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-11-14_06_45PM.pdf';
  assert.equal(latestReportUrl(`<a href="${a}">old</a><a href="${b}">new</a>`), b);
  assert.throws(() => latestReportUrl('no published report'));
});

test('only explicit unique Available status confirms NBA game-day availability', () => {
  const text = 'New Orleans Pelicans Missi, Yves Available Injury/Illness\n' +
    'Murray, Dejounte Out Injury/Illness\nDenver Nuggets Nembhard, Ryan Questionable Injury/Illness';
  assert.equal(statusFromText(text, 'Yves Missi').status, 'confirmed-active');
  assert.equal(statusFromText(text, 'Dejounte Murray').status, 'unconfirmed');
  assert.equal(statusFromText(text, 'Nikola Jokic').status, 'unknown');
  assert.equal(statusFromText(`${text}\nMissi, Yves Out Injury/Illness`, 'Yves Missi').status, 'unknown');
});
