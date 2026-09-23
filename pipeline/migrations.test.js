const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const migrationPath = path.join(
  __dirname,
  'migrations',
  '005_relabel_unscoped_openai_cost_snapshots.sql',
);

const referralRewardMigrationPath = path.join(
  __dirname,
  'migrations',
  '006_referral_reward_ten_dollars.sql',
);
const creatorMigrationPath = path.join(__dirname, 'migrations', '014_email_creator_referrals.sql');
const creatorPartnershipMigrationPath = path.join(__dirname, 'migrations', '017_creator_partnership_access.sql');

test('legacy OpenAI cost migration only relabels keyless snapshots and is repeat-safe', async () => {
  const sql = await fs.readFile(migrationPath, 'utf8');
  const update = sql.match(/UPDATE provider_usage_snapshots[\s\S]*?;/i)?.[0] || '';

  assert.match(update, /SET source\s*=\s*'openai_costs_api_unscoped'/i);
  assert.match(update, /provider\s*=\s*'openai'/i);
  assert.match(update, /source\s*=\s*'openai_costs_api'/i);
  assert.match(update, /api_key_reference IS NULL/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+provider_usage_snapshots/i);

  // Once relabeled, the source predicate no longer matches, making reruns inert.
  const legacyRow = { provider: 'openai', source: 'openai_costs_api', apiKeyReference: null };
  const matchesUpdate = (row) => row.provider === 'openai'
    && row.source === 'openai_costs_api'
    && row.apiKeyReference === null;
  assert.equal(matchesUpdate(legacyRow), true);
  legacyRow.source = 'openai_costs_api_unscoped';
  assert.equal(matchesUpdate(legacyRow), false);
  assert.equal(matchesUpdate({ ...legacyRow, source: 'openai_costs_api', apiKeyReference: 'key_current' }), false);
});

test('referral reward migration replaces its named constraint repeat-safely', async () => {
  const sql = await fs.readFile(referralRewardMigrationPath, 'utf8');
  assert.match(sql, /DROP CONSTRAINT IF EXISTS referral_rewards_reward_amount_cents_valid/i);
  assert.match(sql, /ADD CONSTRAINT referral_rewards_reward_amount_cents_valid/i);
});

test('creator referral migration does not re-add its ownership constraint on bot restart', async () => {
  const sql = await fs.readFile(creatorMigrationPath, 'utf8');
  assert.match(sql, /IF NOT EXISTS\s*\([\s\S]*pg_constraint[\s\S]*referral_rewards_one_owner/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_referral_profiles/i);
  assert.match(sql, /DROP TRIGGER IF EXISTS referral_rewards_validate_owner/i);
});

test('creator partnership access migration preserves trials and supports open-ended terms', async () => {
  const sql = await fs.readFile(creatorPartnershipMigrationPath, 'utf8');
  assert.match(sql, /access_mode text NOT NULL DEFAULT 'TRIAL'/i);
  assert.match(sql, /'PARTNERSHIP'/i);
  assert.match(sql, /access_ends_at timestamptz/i);
});
