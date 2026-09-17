const test = require('node:test');
const assert = require('node:assert/strict');
const { exclusiveTextExtraction, exclusiveSourceIsCurrent } = require('./exclusive-text');
const { buildSourcePickApprovalEmbed } = require('../bot/lib/source-review');
const { shouldQueueForReview } = require('./collect-x');
const source = { publish_mode: 'terms_only', handle: 'EZMSports', display_name: 'EZMSportsBetting' };

test('exclusive text terms retain exact wagers, odds and stakes without research or a league label', () => {
  for (const [text, expected] of [
    ['Teddy Covers\n\nLions/Bills o54.5', 'Teddy Covers\n• Lions/Bills o54.5'],
    ['Ricky Tran\n\nWhite Sox ML', 'Ricky Tran\n• White Sox ML'],
    ["Joe Duffy\n\nNFL\nDetroit Lions +4' (-110)", "Joe Duffy\n• Detroit Lions +4' (-110)"],
    ['Ben Burns\n\n4% Mets F5 ML -145\n3% Lions +4.5 (-110)', 'Ben Burns\n• 4% Mets F5 ML -145\n• 3% Lions +4.5 (-110)'],
    ['Porterpicks\n\n4u - Lions/Bills o54 (-110)\n3u - Syracuse/Pittsburg u51.5 (-110)\n3u - Sparks (+8.5)', 'Porterpicks\n• 4u - Lions/Bills o54 (-110)\n• 3u - Syracuse/Pittsburg u51.5 (-110)\n• 3u - Sparks (+8.5)']
  ]) {
    const extraction = exclusiveTextExtraction(source, text);
    assert.ok(extraction, text);
    assert.equal(buildSourcePickApprovalEmbed({ source, analysis: { status: 'SOURCE_EXTRACTED', extraction } }, 'APPROVED PICK').description, expected);
    assert.equal(shouldQueueForReview(source, { text }, []), true);
    assert.ok(extraction.plays.every(p => p.units === '' && p.odds_american === ''));
  }
});

test('exclusive fast path refuses commentary, unclear terms, capper-feed substitution and regular sources', () => {
  for (const text of ['EZMSports\nLions +4 -110', 'Daily picks of the week\nLions +4', 'Teddy Covers\nUnder 4.5', 'Teddy Covers\nLions +4\nSubscribe to the package', 'Teddy Covers\nNo play on Lions +4', 'Teddy Covers\nGreat matchup tonight']) {
    const e = exclusiveTextExtraction(source, text);
    if (e) assert.throws(() => buildSourcePickApprovalEmbed({ source, analysis: { status: 'SOURCE_EXTRACTED', extraction: e } }, 'APPROVED PICK'), text);
  }
  assert.equal(exclusiveTextExtraction({ publish_mode: 'writeup_review' }, 'Teddy Covers\nLions +4 -110'), null);
});

test('exclusive approval remains limited to current Pacific day and rejects future/missing timestamps', () => {
  const now = new Date('2026-09-17T23:00:00Z');
  const p = timestamp => ({ source: { posted_at: timestamp } });
  assert.equal(exclusiveSourceIsCurrent(p('2026-09-17T07:00:00Z'), now), true);
  assert.equal(exclusiveSourceIsCurrent(p('2026-09-17T06:59:00Z'), now), false);
  assert.equal(exclusiveSourceIsCurrent(p('2026-09-18T01:00:00Z'), now), false);
  assert.equal(exclusiveSourceIsCurrent(p(''), now), false);
});
