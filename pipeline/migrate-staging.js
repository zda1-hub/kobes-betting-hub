const fs = require('node:fs/promises');
const path = require('node:path');

const MIGRATION_DIRECTORY = path.join(__dirname, 'migrations');
const WRANGLER_CONFIGURATION = path.join(__dirname, '..', 'wrangler.jsonc');
const MIGRATION_FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const REQUIRED_SECURED_TABLES = [
  'api_call_events',
  'approval_cards',
  'extraction_runs',
  'grades',
  'membership_customers',
  'membership_events',
  'membership_subscriptions',
  'pick_candidates',
  'pick_operations_schema_migrations',
  'provider_usage_snapshots',
  'published_picks',
  'recap_runs',
  'referral_auth_sessions',
  'referral_events',
  'referral_profiles',
  'referral_rewards',
  'source_posts',
  'stripe_webhook_events',
  'workflow_events',
];

function projectRefFromDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('STAGING_DATABASE_URL must be a valid Postgres URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('STAGING_DATABASE_URL must use the postgres or postgresql scheme.');
  }

  const directMatch = url.hostname.toLowerCase().match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
  if (directMatch) return { projectRef: directMatch[1], url };

  const poolerMatch = decodeURIComponent(url.username).toLowerCase().match(/^postgres\.([a-z0-9]{20})$/);
  if (poolerMatch && url.hostname.toLowerCase().endsWith('.pooler.supabase.com')) {
    return { projectRef: poolerMatch[1], url };
  }

  throw new Error(
    'STAGING_DATABASE_URL must be a Supabase direct or pooler URL whose project reference can be verified.',
  );
}

function validateConfiguration(env, { apply = false, repositoryProductionProjectRef = null } = {}) {
  const databaseUrl = String(env.STAGING_DATABASE_URL || '').trim();
  const stagingProjectRef = String(env.STAGING_SUPABASE_PROJECT_REF || '').trim().toLowerCase();
  const productionProjectRef = String(env.PRODUCTION_SUPABASE_PROJECT_REF || '').trim().toLowerCase();

  if (!databaseUrl) throw new Error('STAGING_DATABASE_URL is required. The generic DATABASE_URL is never used.');
  if (!PROJECT_REF_PATTERN.test(stagingProjectRef)) {
    throw new Error('STAGING_SUPABASE_PROJECT_REF must be the 20-character staging project reference.');
  }
  if (!PROJECT_REF_PATTERN.test(productionProjectRef)) {
    throw new Error('PRODUCTION_SUPABASE_PROJECT_REF must be the 20-character production project reference.');
  }
  if (stagingProjectRef === productionProjectRef) {
    throw new Error('Refusing to continue: staging and production Supabase project references are identical.');
  }
  if (repositoryProductionProjectRef && productionProjectRef !== repositoryProductionProjectRef) {
    throw new Error(
      `Refusing to continue: PRODUCTION_SUPABASE_PROJECT_REF does not match the repository production configuration (${repositoryProductionProjectRef}).`,
    );
  }

  const parsed = projectRefFromDatabaseUrl(databaseUrl);
  if (parsed.projectRef !== stagingProjectRef) {
    throw new Error(
      `Refusing to continue: STAGING_DATABASE_URL targets project ${parsed.projectRef}, not ${stagingProjectRef}.`,
    );
  }
  const sslMode = parsed.url.searchParams.get('sslmode');
  if (!['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
    throw new Error('STAGING_DATABASE_URL must request encrypted transport with sslmode=require (or stricter).');
  }

  const requiredConfirmation = `APPLY_STAGING_MIGRATIONS_TO_${stagingProjectRef}`;
  if (apply && env.STAGING_MIGRATION_CONFIRM !== requiredConfirmation) {
    throw new Error(`--apply requires STAGING_MIGRATION_CONFIRM=${requiredConfirmation}.`);
  }

  return {
    databaseUrl,
    hostname: parsed.url.hostname,
    database: parsed.url.pathname.replace(/^\//, '') || '(default)',
    username: decodeURIComponent(parsed.url.username),
    stagingProjectRef,
  };
}

async function readRepositoryProductionProjectRef(file = WRANGLER_CONFIGURATION) {
  const configuration = await fs.readFile(file, 'utf8');
  const match = configuration.match(
    /"SUPABASE_URL"\s*:\s*"https:\/\/([a-z0-9]{20})\.supabase\.co"/i,
  );
  if (!match) {
    throw new Error('Unable to verify the production Supabase project reference from wrangler.jsonc.');
  }
  return match[1].toLowerCase();
}

async function loadMigrations(directory = MIGRATION_DIRECTORY) {
  const names = (await fs.readdir(directory))
    .filter((name) => MIGRATION_FILE_PATTERN.test(name))
    .sort();
  if (!names.length) throw new Error('No numbered SQL migrations were found.');

  const seen = new Set();
  const migrations = [];
  for (const name of names) {
    const version = name.slice(0, -'.sql'.length);
    if (seen.has(version)) throw new Error(`Duplicate migration version: ${version}.`);
    seen.add(version);
    const sql = await fs.readFile(path.join(directory, name), 'utf8');
    const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const trackingPattern = new RegExp(
      `INSERT\\s+INTO\\s+pick_operations_schema_migrations[\\s\\S]*?VALUES\\s*\\(\\s*'${escapedVersion}'`,
      'i',
    );
    if (!trackingPattern.test(sql)) {
      throw new Error(`${name} does not record its exact version in pick_operations_schema_migrations.`);
    }
    migrations.push({ name, version, sql });
  }
  return migrations;
}

async function readAppliedVersions(client) {
  const table = await client.query(
    "SELECT to_regclass('public.pick_operations_schema_migrations') AS migration_table",
  );
  if (!table.rows[0]?.migration_table) return new Set();
  const result = await client.query('SELECT version FROM public.pick_operations_schema_migrations');
  return new Set(result.rows.map((row) => row.version));
}

async function verifySchema(client, expectedVersions) {
  const [versions, tables, grants] = await Promise.all([
    client.query('SELECT version FROM public.pick_operations_schema_migrations ORDER BY version'),
    client.query(
      `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
      [REQUIRED_SECURED_TABLES],
    ),
    client.query(
      `SELECT table_name, grantee, privilege_type
       FROM information_schema.role_table_grants
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
         AND grantee IN ('anon', 'authenticated')`,
      [REQUIRED_SECURED_TABLES],
    ),
  ]);

  const applied = new Set(versions.rows.map((row) => row.version));
  const missingVersions = expectedVersions.filter((version) => !applied.has(version));
  const tableState = new Map(tables.rows.map((row) => [row.table_name, row.rls_enabled]));
  const missingTables = REQUIRED_SECURED_TABLES.filter((name) => !tableState.has(name));
  const rlsDisabled = REQUIRED_SECURED_TABLES.filter((name) => tableState.get(name) === false);
  const unsafeGrants = grants.rows;
  const ok = !missingVersions.length && !missingTables.length && !rlsDisabled.length && !unsafeGrants.length;
  return { ok, missingVersions, missingTables, rlsDisabled, unsafeGrants };
}

function printVerification(result, log = console.log) {
  if (!result.ok) {
    const details = [
      result.missingVersions.length && `missing migrations: ${result.missingVersions.join(', ')}`,
      result.missingTables.length && `missing tables: ${result.missingTables.join(', ')}`,
      result.rlsDisabled.length && `RLS disabled: ${result.rlsDisabled.join(', ')}`,
      result.unsafeGrants.length && 'anon/authenticated table grants remain',
    ].filter(Boolean).join('; ');
    throw new Error(`Staging schema verification failed: ${details}.`);
  }
  log(`Acceptance checks passed: all migrations recorded, ${REQUIRED_SECURED_TABLES.length} tables present with RLS, no anon/authenticated grants.`);
}

async function run({
  env = process.env,
  apply = false,
  PoolClass,
  log = console.log,
  repositoryProductionProjectRef,
} = {}) {
  const [migrations, configuredProductionRef] = await Promise.all([
    loadMigrations(),
    repositoryProductionProjectRef
      ? Promise.resolve(repositoryProductionProjectRef)
      : readRepositoryProductionProjectRef(),
  ]);
  const config = validateConfiguration(env, {
    apply,
    repositoryProductionProjectRef: configuredProductionRef,
  });
  const Pool = PoolClass || require('pg').Pool;
  const pool = new Pool({
    application_name: 'kobes-betting-hub-staging-migrator',
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 10000,
    max: 1,
  });
  let client;
  try {
    client = await pool.connect();
    const identity = await client.query('SELECT current_database() AS database, current_user AS database_user');
    const actual = identity.rows[0] || {};
    log(`Verified staging target: Supabase ${config.stagingProjectRef}; ${config.hostname}/${actual.database || config.database}; user ${actual.database_user || config.username}.`);

    let applied = await readAppliedVersions(client);
    let pending = migrations.filter((migration) => !applied.has(migration.version));
    log(`Migration plan: ${pending.length ? pending.map((migration) => migration.name).join(', ') : 'nothing pending'}.`);

    if (!apply) {
      log('Plan only; no database writes were made. Re-run with --apply and the project-bound confirmation to migrate.');
      return { applied: [], pending: pending.map((migration) => migration.version), target: config.stagingProjectRef };
    }

    await client.query('BEGIN');
    try {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        ['kobes-betting-hub', 'staging-migrations'],
      );
      applied = await readAppliedVersions(client);
      pending = migrations.filter((migration) => !applied.has(migration.version));
      for (const migration of pending) {
        await client.query(migration.sql);
        const recorded = await client.query(
          'SELECT EXISTS (SELECT 1 FROM public.pick_operations_schema_migrations WHERE version = $1) AS recorded',
          [migration.version],
        );
        if (!recorded.rows[0]?.recorded) {
          throw new Error(`${migration.name} ran but did not record its version.`);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    const verification = await verifySchema(client, migrations.map((migration) => migration.version));
    printVerification(verification, log);
    return {
      applied: pending.map((migration) => migration.version),
      pending: [],
      target: config.stagingProjectRef,
      verification,
    };
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

function usage() {
  return [
    'Usage: node pipeline/migrate-staging.js [--plan | --apply]',
    '',
    'The runner reads only STAGING_DATABASE_URL and never falls back to DATABASE_URL.',
    'Plan mode is the default and performs no writes.',
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
    throw new Error(`${usage()}\nInvalid arguments: ${unknown.join(', ') || 'choose one mode'}`);
  }
  await run({ apply: args.has('--apply') });
}

if (require.main === module) {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.staging.local') });
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  MIGRATION_DIRECTORY,
  REQUIRED_SECURED_TABLES,
  loadMigrations,
  printVerification,
  projectRefFromDatabaseUrl,
  readRepositoryProductionProjectRef,
  readAppliedVersions,
  run,
  validateConfiguration,
  verifySchema,
};
