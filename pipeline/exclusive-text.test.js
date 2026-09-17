const test = require('node:test');
const assert = require('node:assert/strict');
const { exclusiveTextExtraction, exclusiveSourceIsCurrent, exclusiveTextGroups, exclusiveWagerKey, completeXPost } = require('./exclusive-text');
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

test('Betting Buddy separates cappers losslessly and holds unclear blocks independently', () => {
  const feed = { handle: 'BettingBuddyy', display_name: 'Betting Buddy', publish_mode: 'terms_only', exclusive_text_groups: true };
  const text = 'BANKROLL BILL\n\nMLB Part 2/2\nTwins/Angels under 8 -130 (1.5U)\nDetroit Tigers F5 ML -116 (1.25U)\n─────────────────────────\nTCC\nMLB\nKC @ HOU\n─────────────────────────\nTROY WEST\nNFL\nLions +5.5 (-110)';
  const groups = exclusiveTextGroups(feed, text);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].extraction.plays.map(p => p.selection), ['Twins/Angels under 8 -130 (1.5U)', 'Detroit Tigers F5 ML -116 (1.25U)']);
  assert.equal(groups[1].extraction, null);
  assert.equal(groups[2].extraction.source_capper_name, 'TROY WEST');
  const descriptions = groups.filter(g => g.extraction).map(g => buildSourcePickApprovalEmbed({ source: feed, analysis: { status: 'SOURCE_EXTRACTED', extraction: g.extraction } }, 'APPROVED PICK').description);
  assert.ok(!descriptions[0].includes('TROY WEST'));
  assert.equal(descriptions[1], 'TROY WEST\n• Lions +5.5 (-110)');
});

test('grouped feed never treats result/ad/unspecified units or truncated text as bets', () => {
  const feed = { ...source, exclusive_text_groups: true };
  for (const text of ['EXCLUSIVE PLAY\nBrewers ML', 'TCC\nMLB\nKC @ HOU', 'PARDON MY PICK\n2U', 'PROP BOMB\nSubscribe now\nLoveland over 46.5', 'Troy West\nYesterday cashed Lions +5.5', 'Troy West\nLions ML … https://t.co/123']) assert.equal(exclusiveTextGroups(feed, text)[0].extraction, null);
  assert.deepEqual(exclusiveTextGroups(source, 'Troy West\nLions +5.5'), []);
});

test('complete X long-post body wins over truncated preview without changing terms', () => {
  const full = 'Troy West\nLions +5.5 (-110)\n─────────\nBen Burns\nMets ML +120';
  const post = completeXPost({ id: '1', text: 'Troy West …', note_tweet: { text: full } });
  assert.equal(post.text, full);
  assert.equal(completeXPost({ text: 'Lions ML' }).text, 'Lions ML');
});

test('exclusive dedupe matches capper spacing but distinguishes odds, lines, stakes and cappers', () => {
  const key = exclusiveWagerKey('BANKROLL BILL', 'Twins/Angels Under 8 -130 (1.5U)');
  assert.equal(key, exclusiveWagerKey('BankrollBill', 'Twins/Angels under 8 -130 (1.5U)'));
  for (const [capper, bet] of [['Other', 'Twins/Angels Under 8 -130 (1.5U)'], ['BankrollBill', 'Twins/Angels Under 8.5 -130 (1.5U)'], ['BankrollBill', 'Twins/Angels Under 8 -120 (1.5U)'], ['BankrollBill', 'Twins/Angels Under 8 -130 (1U)']]) assert.notEqual(key, exclusiveWagerKey(capper, bet));
});
