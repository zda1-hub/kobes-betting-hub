'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FOOTER, INSUFFICIENT_SAMPLE, windowText, formatMemberResult, nbaResult,
  nflResult } = require('./member-result');

const analysis = { l5: { hits: 5, sample: 5 }, l10: { hits: 8, sample: 10 },
  l20: { hits: 15, sample: 20 } };

test('Kobe compact block has one player, verified Odds API price and 80 percent clovers only', () => {
  const text = nbaResult({ player: 'Payton Pritchard', team: 'Boston Celtics', teamAbbr: 'BOS',
    stat: 'assists', line: 2.5, offers: [{ odds: -300, sportsbook: 'BetRivers',
      sportsbookKey: 'betrivers' }], marketCheckedAt: '2026-11-16T19:00:00Z', analysis });
  assert.equal(text, `Payton Pritchard - *BOS Celtics*\nOver 2.5 Assists (-300)\n` +
    `L5- 5/5 ☘️\nL10- 8/10 ☘️\nL20- 15/20\n${FOOTER}`);
});

test('No price appears without verified Odds API offer evidence', () => {
  const text = nbaResult({ player: 'Payton Pritchard', team: 'Boston Celtics', teamAbbr: 'BOS',
    stat: 'assists', line: 2.5, offers: [{ odds: -300 }], analysis });
  assert.match(text, /Over 2\.5 Assists\n/);
  assert.doesNotMatch(text, /-300/);
  assert.match(windowText('L10', { hits: 7, sample: 10 }), /^L10- 7\/10$/);
  assert.match(windowText('L20', { hits: 16, sample: 20 }), /☘️$/);
  assert.equal(windowText('L5', { hits: 0, sample: 0 }), 'L5- unavailable');
  assert.doesNotMatch(formatMemberResult({ player: 'A', teamAbbr: 'BOS', teamName: 'Celtics',
    stat: 'Assists', line: 2.5, odds: -300, analysis }), /-300/);
});

test('NFL result uses roster team and only the actual quoted price', () => {
  const text = nflResult({ history: { player: 'Josh Allen', stat: 'passing_yards',
    context: { roster: { team: 'BUF' } }, analysis }, market: { line: 199.5,
    offers: [{ odds: +120, sportsbook: 'DraftKings', sportsbookKey: 'draftkings' }],
    fetchedAt: '2026-11-16T19:00:00Z' } });
  assert.match(text, /^Josh Allen - \*BUF Bills\*\nOver 199\.5 Pass yds \(\+120\)/);
  assert.ok(text.endsWith(FOOTER));
});

test('legacy direct DM search never displays a prop with five or fewer observed games', () => {
  for (const sample of [0, 1, 5]) {
    const short = { l5: { hits: sample, sample }, l10: { hits: sample, sample },
      l20: { hits: sample, sample } };
    assert.equal(formatMemberResult({ player: 'P', teamAbbr: 'BOS', teamName: 'Celtics',
      stat: 'Assists', line: 2.5, analysis: short }), INSUFFICIENT_SAMPLE);
  }
  const six = { l5: { hits: 5, sample: 5 }, l10: { hits: 6, sample: 6 },
    l20: { hits: 6, sample: 6 } };
  assert.match(formatMemberResult({ player: 'P', teamAbbr: 'BOS', teamName: 'Celtics',
    stat: 'Assists', line: 2.5, analysis: six }), /L20- 6\/6/);
});
