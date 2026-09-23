import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  creatorCode,
  provisionSportsCentered,
  validateProvisioningEnvironment,
} from './provision-sports-centered-creator.mjs';

const databaseUrl = 'postgresql://postgres.mpajyubbnnsdpgdizvht:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require';

test('provisioning is explicitly confirmed, production-only, and encrypted', () => {
  const good = { PRODUCTION_DATABASE_URL: databaseUrl, CREATOR_PROVISION_CONFIRM: 'PROVISION_SPORTS_CENTERED_CREATOR_IN_PRODUCTION' };
  assert.equal(validateProvisioningEnvironment(good), databaseUrl);
  assert.throws(() => validateProvisioningEnvironment({ ...good, CREATOR_PROVISION_CONFIRM: '' }), /confirmation/);
  assert.throws(() => validateProvisioningEnvironment({ ...good, PRODUCTION_DATABASE_URL: databaseUrl.replace('mpajyubbnnsdpgdizvht', 'aaaaaaaaaaaaaaaaaaaa') }), /non-production/);
  assert.throws(() => validateProvisioningEnvironment({ ...good, PRODUCTION_DATABASE_URL: databaseUrl.replace('?sslmode=require', '') }), /encrypted/);
});

test('creator codes have the required distinct prefix and length', () => {
  assert.match(creatorCode(), /^KBC-[A-F0-9]{10}$/);
});

test('provisions Sports Centered once and returns matching URLs', async () => {
  const calls = [];
  const client = { async query(sql, parameters) {
    calls.push({ sql, parameters });
    if (sql.includes('pick_operations_schema_migrations')) return { rowCount: 2, rows: [{ version: '014_email_creator_referrals' }, { version: '017_creator_partnership_access' }] };
    if (sql.includes('INSERT INTO creator_referral_profiles')) {
      return { rowCount: 1, rows: [{ contact_email: 'sportscenteredpod@gmail.com', display_name: 'Sports Centered', referral_code: parameters[2], status: 'PENDING' }] };
    }
    if (sql.includes('UPDATE creator_referral_profiles')) return { rowCount: 1, rows: [{ contact_email: 'sportscenteredpod@gmail.com', display_name: 'Sports Centered', referral_code: 'KBC-1234567890', status: 'PENDING', access_mode: 'PARTNERSHIP', access_ends_at: null }] };
    return { rowCount: 0, rows: [] };
  } };
  const profile = await provisionSportsCentered(client, () => 'KBC-1234567890');
  assert.equal(profile.onboardingUrl, 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev/creators/login?code=KBC-1234567890');
  assert.equal(profile.referralUrl, 'https://kobesbettinghub.com/join?ref=KBC-1234567890');
  assert.equal(profile.access_mode, 'PARTNERSHIP');
  assert.deepEqual(calls.at(-1).sql, 'COMMIT');
  assert.deepEqual(calls.find(call => call.sql.includes('INSERT INTO creator_referral_profiles')).parameters.slice(0, 2), ['sportscenteredpod@gmail.com', 'Sports Centered']);
});

test('uses the existing creator record on reruns without replacing its code', async () => {
  const client = { async query(sql) {
    if (sql.includes('pick_operations_schema_migrations')) return { rowCount: 2, rows: [{}, {}] };
    if (sql.includes('INSERT INTO creator_referral_profiles')) return { rowCount: 0, rows: [] };
    if (sql.includes('FROM creator_referral_profiles WHERE')) return { rowCount: 1, rows: [{ contact_email: 'sportscenteredpod@gmail.com', display_name: 'Sports Centered', referral_code: 'KBC-EXISTING12', status: 'ACTIVE' }] };
    if (sql.includes('UPDATE creator_referral_profiles')) return { rowCount: 1, rows: [{ contact_email: 'sportscenteredpod@gmail.com', display_name: 'Sports Centered', referral_code: 'KBC-EXISTING12', status: 'ACTIVE', access_mode: 'PARTNERSHIP', access_ends_at: null }] };
    return { rowCount: 0, rows: [] };
  } };
  const profile = await provisionSportsCentered(client, () => 'KBC-1234567890');
  assert.equal(profile.referral_code, 'KBC-EXISTING12');
  assert.equal(profile.status, 'ACTIVE');
});

test('refuses to provision without the required schema migration', async () => {
  const calls = [];
  const client = { async query(sql) { calls.push(sql); return { rowCount: 0, rows: [] }; } };
  await assert.rejects(provisionSportsCentered(client), /migrations 014 and 017/);
  assert.equal(calls.at(-1), 'ROLLBACK');
});
