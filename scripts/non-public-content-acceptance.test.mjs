import test from 'node:test';
import assert from 'node:assert/strict';
import { runNonPublicContentAcceptance } from './non-public-content-acceptance.mjs';

test('recap and Trends fixtures pass without any external delivery', () => {
  const report = runNonPublicContentAcceptance();
  assert.equal(report.ok, true);
  assert.equal(report.mode, 'fixture-only-no-send');
  assert.equal(report.networkCalls, 0);
  assert.equal(report.discordPosts, 0);
  assert.equal(report.emailsSent, 0);
  assert.equal(report.xPosts, 0);
  assert.ok(report.recapEmbeds > 0);
  assert.ok(report.trendsEmbeds > 0);
});
