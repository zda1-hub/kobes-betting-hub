const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadMigrations,
  printVerification,
  projectRefFromDatabaseUrl,
  readRepositoryProductionProjectRef,
  REQUIRED_SECURED_TABLES,
  SERVICE_ROLE_READ_ONLY_TABLES,
  SERVICE_ROLE_REQUIRED_PRIVILEGES,
  run,
  validateConfiguration,
} = require('./migrate-staging');

const STAGING_REF = 'aaaaaaaaaaaaaaaaaaaa';
const PRODUCTION_REF = 'bbbbbbbbbbbbbbbbbbbb';

function environment(overrides = {}) {
  return {
    STAGING_DATABASE_URL: `postgresql://postgres.${STAGING_REF}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    STAGING_SUPABASE_PROJECT_REF: STAGING_REF,
    PRODUCTION_SUPABASE_PROJECT_REF: PRODUCTION_REF,
    ...overrides,
  };
}

test('extracts a Supabase project reference from direct and pooler URLs', () => {
  assert.equal(
    projectRefFromDatabaseUrl(`postgresql://postgres:secret@db.${STAGING_REF}.supabase.co:5432/postgres`).projectRef,
    STAGING_REF,
  );
  assert.equal(projectRefFromDatabaseUrl(environment().STAGING_DATABASE_URL).projectRef, STAGING_REF);
});

test('staging configuration never accepts an unverified or production target', () => {
  assert.throws(() => validateConfiguration(environment({ STAGING_DATABASE_URL: '' })), /never used/);
  assert.throws(
    () => validateConfiguration(environment({ STAGING_SUPABASE_PROJECT_REF: PRODUCTION_REF })),
    /identical/,
  );
  assert.throws(
    () => validateConfiguration(environment({
      STAGING_DATABASE_URL: `postgresql://postgres.${PRODUCTION_REF}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    })),
    /targets project b{20}, not a{20}/,
  );
  assert.throws(
    () => validateConfiguration(environment({
      STAGING_DATABASE_URL: `postgresql://postgres.${STAGING_REF}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
    })),
    /encrypted transport/,
  );
  assert.throws(
    () => validateConfiguration(environment({
      STAGING_DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/postgres?sslmode=require',
    })),
    /must be a Supabase/,
  );
});

test('apply mode requires a confirmation bound to the staging project', () => {
  assert.throws(() => validateConfiguration(environment(), { apply: true }), /--apply requires/);
  assert.doesNotThrow(() => validateConfiguration(environment({
    STAGING_MIGRATION_CONFIRM: `APPLY_STAGING_MIGRATIONS_TO_${STAGING_REF}`,
  }), { apply: true }));
});

test('declared production reference must match the repository production target', async () => {
  const repositoryProductionRef = await readRepositoryProductionProjectRef();
  assert.match(repositoryProductionRef, /^[a-z0-9]{20}$/);
  assert.throws(() => validateConfiguration(environment(), {
    repositoryProductionProjectRef: repositoryProductionRef,
  }), /does not match the repository production configuration/);
});

test('every numbered SQL migration records its exact filename version', async () => {
  const migrations = await loadMigrations();
  assert.ok(migrations.length >= 7);
  assert.deepEqual(
    migrations.map((migration) => migration.name),
    [...migrations.map((migration) => migration.name)].sort(),
  );
  assert.equal(new Set(migrations.map((migration) => migration.version)).size, migrations.length);
});

test('failed acceptance evidence is explicit', () => {
  assert.throws(() => printVerification({
    ok: false,
    missingVersions: ['002_membership_persistence'],
    missingTables: ['membership_customers'],
    rlsDisabled: ['membership_events'],
    unsafeGrants: [{ table_name: 'membership_subscriptions', grantee: 'anon' }],
    missingServiceRoleGrants: [{ table: 'referral_rewards', privilege: 'SELECT' }],
  }), /missing migrations: 002_membership_persistence.*missing tables: membership_customers.*RLS disabled: membership_events.*grants remain.*service_role backend grants are incomplete/);
});

test('apply runs pending migrations in one transaction and verifies the secured schema', async () => {
  const applied = new Set();
  const transactionEvents = [];
  const client = {
    async query(sql, values = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized === 'SELECT current_database() AS database, current_user AS database_user') {
        return { rows: [{ database: 'postgres', database_user: `postgres.${STAGING_REF}` }] };
      }
      if (normalized.startsWith("SELECT to_regclass('public.pick_operations_schema_migrations')")) {
        return { rows: [{ migration_table: applied.size ? 'pick_operations_schema_migrations' : null }] };
      }
      if (normalized === 'SELECT version FROM public.pick_operations_schema_migrations') {
        return { rows: [...applied].map((version) => ({ version })) };
      }
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        transactionEvents.push(normalized);
        return { rows: [] };
      }
      if (normalized.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [{}] };
      if (normalized.startsWith('SELECT EXISTS (SELECT 1 FROM public.pick_operations_schema_migrations')) {
        return { rows: [{ recorded: applied.has(values[0]) }] };
      }
      if (normalized === 'SELECT version FROM public.pick_operations_schema_migrations ORDER BY version') {
        return { rows: [...applied].sort().map((version) => ({ version })) };
      }
      if (normalized.includes('FROM pg_class c')) {
        return { rows: REQUIRED_SECURED_TABLES.map((table_name) => ({ table_name, rls_enabled: true })) };
      }
      if (normalized.includes("grantee IN ('anon', 'authenticated')")) return { rows: [] };
      if (normalized.includes("grantee = 'service_role'")) {
        return {
          rows: REQUIRED_SECURED_TABLES.flatMap((table_name) => {
            const privileges = SERVICE_ROLE_READ_ONLY_TABLES.has(table_name)
              ? ['SELECT']
              : SERVICE_ROLE_REQUIRED_PRIVILEGES;
            return privileges.map((privilege_type) => ({ table_name, privilege_type }));
          }),
        };
      }

      const version = normalized.match(
        /INSERT INTO pick_operations_schema_migrations \(version, applied_at\) VALUES \('([^']+)'/i,
      )?.[1];
      assert.ok(version, `Unexpected query in fake staging database: ${normalized.slice(0, 100)}`);
      applied.add(version);
      return { rows: [] };
    },
    release() {},
  };
  class FakePool {
    async connect() { return client; }
    async end() {}
  }

  const result = await run({
    env: environment({ STAGING_MIGRATION_CONFIRM: `APPLY_STAGING_MIGRATIONS_TO_${STAGING_REF}` }),
    apply: true,
    PoolClass: FakePool,
    log() {},
    repositoryProductionProjectRef: PRODUCTION_REF,
  });

  assert.deepEqual(transactionEvents, ['BEGIN', 'COMMIT']);
  assert.equal(result.verification.ok, true);
  assert.equal(result.applied.length, applied.size);
  assert.ok(result.applied.includes('002_membership_persistence'));
});
