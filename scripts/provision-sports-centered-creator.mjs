import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const { EXPECTED_PRODUCTION_PROJECT_REF, projectRefFromDatabaseUrl } = require('../pipeline/migrate-production');

const CREATOR_EMAIL = String(process.env.CREATOR_EMAIL || 'sportscenteredpod@gmail.com').trim().toLowerCase();
const CREATOR_NAME = String(process.env.CREATOR_NAME || 'Sports Centered').trim();
const CHECKOUT_ORIGIN = 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev';
const SITE_ORIGIN = 'https://kobesbettinghub.com';
const CONFIRMATION = String(process.env.CREATOR_CONFIRMATION || 'PROVISION_SPORTS_CENTERED_CREATOR_IN_PRODUCTION');

export function validateProvisioningEnvironment(env = process.env) {
  if (env.CREATOR_PROVISION_CONFIRM !== CONFIRMATION) throw new Error('Creator provisioning confirmation is missing.');
  const databaseUrl = String(env.PRODUCTION_DATABASE_URL || '').trim();
  const parsed = projectRefFromDatabaseUrl(databaseUrl);
  if (parsed.projectRef !== EXPECTED_PRODUCTION_PROJECT_REF) throw new Error('Refusing a non-production Supabase project.');
  if (!['require', 'verify-ca', 'verify-full'].includes(parsed.url.searchParams.get('sslmode'))) {
    throw new Error('Production database transport must be encrypted.');
  }
  return databaseUrl;
}

export function creatorCode() {
  return `KBC-${randomBytes(5).toString('hex').toUpperCase()}`;
}

export async function provisionSportsCentered(client, codeFactory = creatorCode) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL statement_timeout = '10s'");
    const migration = await client.query(
      'SELECT 1 FROM pick_operations_schema_migrations WHERE version = $1',
      ['014_email_creator_referrals'],
    );
    if (migration.rowCount !== 1) throw new Error('Creator referral migration 014 is not applied.');

    let profile;
    for (let attempt = 0; attempt < 3 && !profile; attempt += 1) {
      const inserted = await client.query(
        `INSERT INTO creator_referral_profiles (contact_email, display_name, referral_code)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING contact_email, display_name, referral_code, status`,
        [CREATOR_EMAIL, CREATOR_NAME, codeFactory()],
      );
      profile = inserted.rows[0];
      if (!profile) {
        const existing = await client.query(
          `SELECT contact_email, display_name, referral_code, status
             FROM creator_referral_profiles WHERE contact_email = $1`,
          [CREATOR_EMAIL],
        );
        profile = existing.rows[0];
      }
    }
    if (!profile) throw new Error('Unable to provision a unique creator code.');
    if (profile.contact_email !== CREATOR_EMAIL) throw new Error('Creator email mismatch.');
    await client.query('COMMIT');
    return {
      ...profile,
      onboardingUrl: `${CHECKOUT_ORIGIN}/creators/login?code=${profile.referral_code}`,
      referralUrl: `${SITE_ORIGIN}/join?ref=${profile.referral_code}`,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const databaseUrl = validateProvisioningEnvironment();
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const profile = await provisionSportsCentered(pool);
    console.log(JSON.stringify({
      creator: profile.display_name,
      email: profile.contact_email,
      status: profile.status,
      onboardingUrl: profile.onboardingUrl,
      referralUrl: profile.referralUrl,
      note: 'The referral URL is inactive until the creator verifies Discord email and completes Stripe payout onboarding. Do not send before partner terms are agreed.',
    }));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Creator provisioning failed safely.');
    process.exitCode = 1;
  });
}
