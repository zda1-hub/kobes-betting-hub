const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRecapReview, publicationGradeHold, splitRecapBody } = require('./recap-review');
const row = { pick_id: 'a', operating_date: '2026-09-17', status: 'PUBLISHED', published_at: '2026-09-17T18:00:00Z', post_reference: 'https://discord.com/channels/1/2/3', selection: 'Original wager', result: 'PENDING' };
test('review is explicit about unresolved groups and never invents a record', () => {
  const review = buildRecapReview({ date: row.operating_date, rows: [row], attempts: new Map([['a', { reason: 'Unsupported league.' }]]) });
  const text = review.parts.join('');
  assert.match(text, /NOT A FINAL RECAP/);
  assert.match(text, /NOT an individual-wager/);
  assert.match(text, /Unsupported league/);
  assert.match(text, /No verified settled/);
  assert.match(text, /first wager alone/);
  assert.deepEqual(review.includedPickIds, ['a']);
});
test('review excludes private drafts, another date, failed publications and unverified settled claims', () => {
  const review = buildRecapReview({ date: row.operating_date, rows: [row, { ...row, pick_id: 'draft', published_at: '' }, { ...row, pick_id: 'old', operating_date: '2026-09-16' }, { ...row, pick_id: 'failed', status: 'FAILED' }, { ...row, pick_id: 'claimed', result: 'W' }] });
  assert.deepEqual(review.includedPickIds, ['a', 'claimed']);
  assert.match(review.parts.join(''), /0 verified settled/);
});
test('settled verified results preserve source and a complete day needs no draft', () => {
  const settled = { ...row, pick_id: 'b', result: 'W', result_verified_source: 'ESPN final box score' };
  const text = buildRecapReview({ date: row.operating_date, rows: [row, settled] }).parts.join('');
  assert.match(text, /1 verified settled/);
  assert.match(text, /ESPN final box score/);
  assert.equal(buildRecapReview({ date: row.operating_date, rows: [settled] }), null);
});
test('notification splitting is lossless and fits the existing queue bound', () => {
  const body = Array.from({ length: 200 }, (_, i) => `${i}: ${'X'.repeat(220)}\n\n`).join('') + 'TAIL';
  const parts = splitRecapBody(body);
  assert.ok(parts.length > 1);
  assert.ok(parts.every(part => part.length <= 11000));
  assert.equal(parts.join(''), body);
  assert.equal(splitRecapBody('x'.repeat(23000)).join(''), 'x'.repeat(23000));
});
test('multi-wager publications cannot receive a result based on their first wager', () => {
  const published = { pick_id: '20260917-1-X' };
  assert.match(publicationGradeHold(published, { pick_id: published.pick_id, analysis: { extraction: { plays: [{ selection: 'A' }, { selection: 'B' }] } } }), /first-wager-only/);
  assert.equal(publicationGradeHold(published, { pick_id: published.pick_id, analysis: { extraction: { plays: [{ selection: 'A' }] } } }), '');
});
test('missing and mismatched source packets are held without blocking ordinary manual entries', () => {
  assert.match(publicationGradeHold({ pick_id: '20260917-1-X' }, null), /unavailable/);
  assert.match(publicationGradeHold({ pick_id: '20260917-1-X' }, { pick_id: 'different' }), /mismatch/);
  assert.equal(publicationGradeHold({ pick_id: '20260917-NFL-1' }, null), '');
});
