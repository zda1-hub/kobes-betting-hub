const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const EXPECTED_PRODUCTION_PROJECT_REF = 'mpajyubbnnsdpgdizvht';
const MIGRATION_DIRECTORY = path.join(__dirname, 'migrations');
const CONFIRMATION_PHRASE = `APPLY_PRODUCTION_MIGRATIONS_TO_${EXPECTED_PRODUCTION_PROJECT_REF}`;
const APPROVED_MIGRATIONS = [
  {
    name: '007_service_role_rest_access.sql',
    version: '007_service_role_rest_access',
    sha256: 'bd92491e1fc4f49bcbff64c424bb6bbc905e32c3056e168cd5e243a8a8d931c6',
  },
  {
    name: '008_subscription_cancellation_fields.sql',
    version: '008_subscription_cancellation_fields',
    sha256: '6f19392e805fc5ff004ab9308ef9f0cb863a86e9fae0aee5493865acf382f059',
  },
  {
    name: '009_membership_entitlement_blocks.sql',
    version: '009_membership_entitlement_blocks',
    sha256: 'c011195cbbb91161f1ef6844ce041d724c8217995756980a2030968cd072a098',
  },
  {
    name: '010_referral_payout_safety.sql',
    version: '010_referral_payout_safety',
    sha256: '2e8e1eee812d17db951d73136c50d98e13551076d5399f99b937525a6069546d',
  },
  {
    name: '012_secure_onboarding_analytics.sql',
    version: '012_secure_onboarding_analytics',
    sha256: '3274ad31331f9835698aaead3b45c8c651602a2688d8d34233188d59957298c8',
  },
  {
    name: '013_long_term_dashboard.sql',
    version: '013_long_term_dashboard',
    sha256: 'b9575de40d9c7a17fc727e03f5a80f99d5b53e0fba613f6f667b14e05eeb4e0f',
  },
  {
    name: '014_email_creator_referrals.sql',
    version: '014_email_creator_referrals',
    sha256: '7e2669a5ea62b2244e8a4e85097dc635209196929729bba13a2afd69e05ff25a',
  },
];
const PROTECTED_TABLES = [
  'source_posts',
  'extraction_runs',
  'pick_candidates',
  'workflow_events',
  'approval_cards',
  'published_picks',
  'grades',
  'recap_runs',
  'membership_customers',
  'membership_subscriptions',
  'stripe_webhook_events',
  'membership_events',
  'api_call_events',
  'provider_usage_snapshots',
  'referral_profiles',
  'creator_referral_profiles',
  'referral_rewards',
  'referral_events',
  'referral_auth_sessions',
  'membership_checkout_associations',
  'analytics_sessions',
  'analytics_events',
  'cancellation_feedback',
  'membership_billing_events',
  'member_lifecycle_outbox',
];
const REQUIRED_SERVICE_ROLE_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE'];

class MigrationSafetyError extends Error {}

function projectRefFromDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new MigrationSafetyError('PRODUCTION_DATABASE_URL must be a valid Postgres URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new MigrationSafetyError('PRODUCTION_DATABASE_URL must use the postgres or postgresql scheme.');
  }

  const hostname = url.hostname.toLowerCase();
  const directMatch = hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
  const poolerMatch = decodeURIComponent(url.username).toLowerCase().match(/^postgres\.([a-z0-9]{20})$/);
  if (directMatch) return { projectRef: directMatch[1], url };
  if (poolerMatch && hostname.endsWith('.pooler.supabase.com')) {
    return { projectRef: poolerMatch[1], url };
  }
  throw new MigrationSafetyError('PRODUCTION_DATABASE_URL must identify a Supabase project in its direct host or pooler user.');
}

function validateConfiguration(env, { apply = false } = {}) {
  const databaseUrl = String(env.PRODUCTION_DATABASE_URL || '').trim();
  if (!databaseUrl) {
    throw new MigrationSafetyError('PRODUCTION_DATABASE_URL is required; DATABASE_URL is never used.');
  }
  const parsed = projectRefFromDatabaseUrl(databaseUrl);
  if (parsed.projectRef !== EXPECTED_PRODUCTION_PROJECT_REF) {
    throw new MigrationSafetyError(`Refusing target: expected production project ${EXPECTED_PRODUCTION_PROJECT_REF}.`);
  }
  const sslMode = parsed.url.searchParams.get('sslmode');
  if (!['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
    throw new MigrationSafetyError('PRODUCTION_DATABASE_URL must require encrypted transport.');
  }
  if (apply && env.PRODUCTION_MIGRATION_CONFIRM !== CONFIRMATION_PHRASE) {
    throw new MigrationSafetyError(`--apply requires PRODUCTION_MIGRATION_CONFIRM=${CONFIRMATION_PHRASE}.`);
  }
  return { databaseUrl, projectRef: parsed.projectRef };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function loadApprovedMigrations(directory = MIGRATION_DIRECTORY) {
  const migrations = [];
  for (const approved of APPROVED_MIGRATIONS) {
    let sql;
    try {
      sql = await fs.readFile(path.join(directory, approved.name), 'utf8');
    } catch {
      throw new MigrationSafetyError(`Approved migration file is missing: ${approved.name}.`);
    }
    if (sha256(sql) !== approved.sha256) {
      throw new MigrationSafetyError(`Approved migration file hash mismatch: ${approved.name}.`);
    }
    const escapedVersion = approved.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ledgerRecord = new RegExp(
      `INSERT\\s+INTO\\s+pick_operations_schema_migrations[\\s\\S]*?VALUES\\s*\\(\\s*'${escapedVersion}'`,
      'i',
    );
    if (!ledgerRecord.test(sql)) {
      throw new MigrationSafetyError(`Approved migration does not record its exact version: ${approved.name}.`);
    }
    migrations.push({ ...approved, sql });
  }
  return migrations;
}

async function readAppliedVersions(client) {
  const result = await client.query(
    `SELECT version
       FROM public.pick_operations_schema_migrations
      WHERE version = ANY($1::text[])`,
    [APPROVED_MIGRATIONS.map((migration) => migration.version)],
  );
  return new Set(result.rows.map((row) => row.version));
}

async function verifyProductionSchema(client) {
  const [applied, columns, rls, grants] = await Promise.all([
    readAppliedVersions(client),
    client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'membership_subscriptions'
          AND column_name = ANY($1::text[])`,
      [['cancel_at', 'entitlement_blocked', 'entitlement_block_reason', 'entitlement_blocked_at']],
    ),
    client.query(
      `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname = ANY($1::text[])`,
      [[...PROTECTED_TABLES, 'pick_operations_schema_migrations']],
    ),
    client.query(
      `SELECT table_name, grantee, privilege_type
         FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
          AND grantee IN ('anon', 'authenticated', 'service_role')`,
      [[...PROTECTED_TABLES, 'pick_operations_schema_migrations']],
    ),
  ]);

  const missingVersions = APPROVED_MIGRATIONS
    .map((migration) => migration.version)
    .filter((version) => !applied.has(version));
  const columnState = new Map(columns.rows.map((row) => [row.column_name, row]));
  const invalidColumns = [
    ['cancel_at', 'timestamp with time zone', 'YES'],
    ['entitlement_blocked', 'boolean', 'NO'],
    ['entitlement_block_reason', 'text', 'YES'],
    ['entitlement_blocked_at', 'timestamp with time zone', 'YES'],
  ].filter(([name, type, nullable]) => {
    const column = columnState.get(name);
    if (!column || column.data_type !== type || column.is_nullable !== nullable) return true;
    return name === 'entitlement_blocked' && !/false/i.test(String(column.column_default || ''));
  }).map(([name]) => name);

  const rlsState = new Map(rls.rows.map((row) => [row.table_name, row.rls_enabled]));
  const missingRls = [...PROTECTED_TABLES, 'pick_operations_schema_migrations']
    .filter((table) => rlsState.get(table) !== true);
  const unsafeBrowserGrants = grants.rows.filter((row) => ['anon', 'authenticated'].includes(row.grantee));
  const serviceRoleGrants = new Set(grants.rows
    .filter((row) => row.grantee === 'service_role')
    .map((row) => `${row.table_name}:${row.privilege_type}`));
  const missingServiceRoleGrants = PROTECTED_TABLES.flatMap((table) => REQUIRED_SERVICE_ROLE_PRIVILEGES
    .filter((privilege) => !serviceRoleGrants.has(`${table}:${privilege}`))
    .map((privilege) => `${table}:${privilege}`));
  if (!serviceRoleGrants.has('pick_operations_schema_migrations:SELECT')) {
    missingServiceRoleGrants.push('pick_operations_schema_migrations:SELECT');
  }

  const failures = [
    missingVersions.length && 'approved migration ledger entries are missing',
    invalidColumns.length && 'membership columns do not match the approved schema',
    missingRls.length && 'required RLS protections are missing',
    unsafeBrowserGrants.length && 'anon/authenticated grants remain',
    missingServiceRoleGrants.length && 'service_role grants are incomplete',
  ].filter(Boolean);
  if (failures.length) throw new MigrationSafetyError(`Production migration verification failed: ${failures.join('; ')}.`);
  return { ok: true };
}

async function run({
  env = process.env,
  apply = false,
  PoolClass,
  migrationDirectory = MIGRATION_DIRECTORY,
  log = console.log,
} = {}) {
  const config = validateConfiguration(env, { apply });
  const migrations = await loadApprovedMigrations(migrationDirectory);
  const Pool = PoolClass || require('pg').Pool;
  let pool;
  try {
    pool = new Pool({
      application_name: 'kobes-betting-hub-production-migrator',
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 10000,
      max: 1,
    });
  } catch {
    throw new MigrationSafetyError('Production migration database connection failed.');
  }
  let client;
  try {
    client = await pool.connect();
    const appliedBefore = await readAppliedVersions(client);
    const pendingBefore = migrations.filter((migration) => !appliedBefore.has(migration.version));
    log(`Verified production target: ${config.projectRef}.`);
    log(`Migration plan: ${pendingBefore.length ? pendingBefore.map((migration) => migration.name).join(', ') : 'nothing pending'}.`);
    if (!apply) {
      log('Plan only; no database writes were made.');
      return {
        applied: [],
        pending: pendingBefore.map((migration) => migration.version),
        skipped: migrations.filter((migration) => appliedBefore.has(migration.version)).map((migration) => migration.version),
        target: config.projectRef,
      };
    }

    await client.query('BEGIN');
    try {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        ['kobes-betting-hub', 'production-migrations-007-012'],
      );
      const appliedInsideLock = await readAppliedVersions(client);
      const pending = migrations.filter((migration) => !appliedInsideLock.has(migration.version));
      for (const migration of pending) {
        await client.query(migration.sql);
        const recorded = await client.query(
          `SELECT EXISTS (
             SELECT 1 FROM public.pick_operations_schema_migrations WHERE version = $1
           ) AS recorded`,
          [migration.version],
        );
        if (!recorded.rows[0]?.recorded) {
          throw new MigrationSafetyError(`Migration failed to record its approved version: ${migration.name}.`);
        }
      }
      await verifyProductionSchema(client);
      await client.query('COMMIT');
      log(`Apply complete: ${pending.length ? pending.map((migration) => migration.name).join(', ') : 'nothing newly applied'}.`);
      return {
        applied: pending.map((migration) => migration.version),
        pending: [],
        skipped: migrations.filter((migration) => appliedInsideLock.has(migration.version)).map((migration) => migration.version),
        target: config.projectRef,
        verification: { ok: true },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof MigrationSafetyError) throw error;
      throw new MigrationSafetyError('Production migration database operation failed.');
    }
  } catch (error) {
    if (error instanceof MigrationSafetyError) throw error;
    throw new MigrationSafetyError('Production migration database connection failed.');
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

function usage() {
  return [
    'Usage: node pipeline/migrate-production.js [--plan | --apply]',
    '',
    'Plan mode is the default and makes no database writes.',
    'Only the explicitly allowlisted production migrations are considered.',
  ].join('\n');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) {
    console.log(usage());
    return;
  }
  const unknown = [...args].filter((arg) => !['--plan', '--apply'].includes(arg));
  if (unknown.length || (args.has('--plan') && args.has('--apply'))) {
    throw new MigrationSafetyError('Invalid production migration arguments. Use --plan or --apply.');
  }
  await run({ apply: args.has('--apply') });
}

if (require.main === module) {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.production.local') });
  main().catch((error) => {
    console.error(error instanceof MigrationSafetyError ? error.message : 'Production migration failed safely.');
    process.exitCode = 1;
  });
}

module.exports = {
  APPROVED_MIGRATIONS,
  CONFIRMATION_PHRASE,
  EXPECTED_PRODUCTION_PROJECT_REF,
  MigrationSafetyError,
  PROTECTED_TABLES,
  loadApprovedMigrations,
  projectRefFromDatabaseUrl,
  readAppliedVersions,
  run,
  validateConfiguration,
  verifyProductionSchema,
};
