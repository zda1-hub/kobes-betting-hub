const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  APPROVED_MIGRATIONS,
  CONFIRMATION_PHRASE,
  EXPECTED_PRODUCTION_PROJECT_REF,
  PROTECTED_TABLES,
  loadApprovedMigrations,
  projectRefFromDatabaseUrl,
  run,
  validateConfiguration,
} = require('./migrate-production');

const PASSWORD = 'do-not-print-this-password';
const productionUrl = () => `postgresql://postgres.${EXPECTED_PRODUCTION_PROJECT_REF}:${PASSWORD}@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require`;

function environment(overrides = {}) {
  return {
    PRODUCTION_DATABASE_URL: productionUrl(),
    ...overrides,
  };
}

test('accepts only the hard-coded production Supabase project', () => {
  assert.equal(projectRefFromDatabaseUrl(productionUrl()).projectRef, EXPECTED_PRODUCTION_PROJECT_REF);
  assert.equal(
    projectRefFromDatabaseUrl(`postgresql://postgres:${PASSWORD}@db.${EXPECTED_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=verify-full`).projectRef,
    EXPECTED_PRODUCTION_PROJECT_REF,
  );
  assert.throws(() => validateConfiguration({ DATABASE_URL: productionUrl() }), /never used/);
  assert.throws(() => validateConfiguration(environment({
    PRODUCTION_DATABASE_URL: 'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require',
  })), /expected production project/);
  assert.throws(() => validateConfiguration(environment({
    PRODUCTION_DATABASE_URL: `postgresql://postgres.${EXPECTED_PRODUCTION_PROJECT_REF}:secret@localhost:5432/postgres?sslmode=require`,
  })), /must identify a Supabase project/);
  assert.throws(() => validateConfiguration(environment({
    PRODUCTION_DATABASE_URL: productionUrl().replace('?sslmode=require', ''),
  })), /encrypted transport/);
});

test('apply requires the exact confirmation bound to production', () => {
  assert.throws(() => validateConfiguration(environment(), { apply: true }), /--apply requires/);
  assert.throws(() => validateConfiguration(environment({
    PRODUCTION_MIGRATION_CONFIRM: 'APPLY_PRODUCTION_MIGRATIONS',
  }), { apply: true }), /--apply requires/);
  assert.doesNotThrow(() => validateConfiguration(environment({
    PRODUCTION_MIGRATION_CONFIRM: CONFIRMATION_PHRASE,
  }), { apply: true }));
});

test('loads only pinned production migrations through the long-term dashboard in order', async () => {
  const migrations = await loadApprovedMigrations();
  assert.deepEqual(migrations.map((migration) => migration.name), APPROVED_MIGRATIONS.map((migration) => migration.name));
  assert.deepEqual(migrations.map((migration) => migration.version), APPROVED_MIGRATIONS.map((migration) => migration.version));
});

test('fails closed when an approved migration file is missing or changed', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-production-migrations-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const migration of APPROVED_MIGRATIONS) {
    await fs.copyFile(path.join(__dirname, 'migrations', migration.name), path.join(directory, migration.name));
  }
  await fs.appendFile(path.join(directory, APPROVED_MIGRATIONS[1].name), '\n-- unauthorized change\n');
  await assert.rejects(() => loadApprovedMigrations(directory), /hash mismatch/);
  await fs.copyFile(
    path.join(__dirname, 'migrations', APPROVED_MIGRATIONS[1].name),
    path.join(directory, APPROVED_MIGRATIONS[1].name),
  );
  await fs.rm(path.join(directory, APPROVED_MIGRATIONS[2].name));
  await assert.rejects(() => loadApprovedMigrations(directory), /missing/);
});

function fakeDatabase(initialVersions = []) {
  const versions = new Set(initialVersions);
  const events = [];
  const writes = [];
  const client = {
    async query(sql, values = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      events.push(normalized);
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        writes.push(normalized);
        return { rows: [] };
      }
      if (normalized.startsWith('SELECT pg_advisory_xact_lock')) {
        writes.push('LOCK');
        return { rows: [{}] };
      }
      if (normalized.startsWith('SELECT version FROM public.pick_operations_schema_migrations WHERE version = ANY')) {
        return { rows: [...versions].map((version) => ({ version })) };
      }
      if (normalized.startsWith('SELECT EXISTS ( SELECT 1 FROM public.pick_operations_schema_migrations')) {
        return { rows: [{ recorded: versions.has(values[0]) }] };
      }
      if (normalized.includes('FROM information_schema.columns')) {
        return { rows: [
          { column_name: 'cancel_at', data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null },
          { column_name: 'entitlement_blocked', data_type: 'boolean', is_nullable: 'NO', column_default: 'false' },
          { column_name: 'entitlement_block_reason', data_type: 'text', is_nullable: 'YES', column_default: null },
          { column_name: 'entitlement_blocked_at', data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null },
        ] };
      }
      if (normalized.includes('FROM pg_class c')) {
        return { rows: [...PROTECTED_TABLES, 'pick_operations_schema_migrations']
          .map((table_name) => ({ table_name, rls_enabled: true })) };
      }
      if (normalized.includes('FROM information_schema.role_table_grants')) {
        return { rows: [
          ...PROTECTED_TABLES.flatMap((table_name) => ['SELECT', 'INSERT', 'UPDATE']
            .map((privilege_type) => ({ table_name, grantee: 'service_role', privilege_type }))),
          { table_name: 'pick_operations_schema_migrations', grantee: 'service_role', privilege_type: 'SELECT' },
        ] };
      }
      const version = normalized.match(
        /INSERT INTO pick_operations_schema_migrations \(version, applied_at\) VALUES \('([^']+)'/i,
      )?.[1];
      if (version) {
        versions.add(version);
        writes.push(`MIGRATION:${version}`);
        return { rows: [] };
      }
      throw new Error(`Unexpected fake database query: ${normalized.slice(0, 120)}`);
    },
    release() {},
  };
  class FakePool {
    async connect() { return client; }
    async end() {}
  }
  return { FakePool, events, versions, writes };
}

test('default plan is ledger-aware, read-only, and emits no credentials', async () => {
  const database = fakeDatabase([APPROVED_MIGRATIONS[0].version]);
  const logs = [];
  const result = await run({ env: environment(), PoolClass: database.FakePool, log: (line) => logs.push(line) });
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.skipped, [APPROVED_MIGRATIONS[0].version]);
  assert.deepEqual(result.pending, APPROVED_MIGRATIONS.slice(1).map((migration) => migration.version));
  assert.deepEqual(database.writes, []);
  assert.doesNotMatch(logs.join('\n'), new RegExp(PASSWORD));
  assert.doesNotMatch(logs.join('\n'), /pooler|postgresql:|postgres\./);
});

test('apply rechecks the ledger under one advisory-locked transaction and skips applied migrations', async () => {
  const database = fakeDatabase([APPROVED_MIGRATIONS[0].version]);
  const result = await run({
    env: environment({ PRODUCTION_MIGRATION_CONFIRM: CONFIRMATION_PHRASE }),
    apply: true,
    PoolClass: database.FakePool,
    log() {},
  });
  assert.deepEqual(database.writes, [
    'BEGIN',
    'LOCK',
    ...APPROVED_MIGRATIONS.slice(1).map((migration) => `MIGRATION:${migration.version}`),
    'COMMIT',
  ]);
  assert.deepEqual(result.applied, APPROVED_MIGRATIONS.slice(1).map((migration) => migration.version));
  assert.deepEqual(result.skipped, [APPROVED_MIGRATIONS[0].version]);
  assert.equal(result.verification.ok, true);
});

test('apply rolls back and returns a sanitized error on a database failure', async () => {
  class FailingPool {
    async connect() {
      return {
        async query(sql) {
          const normalized = sql.replace(/\s+/g, ' ').trim();
          if (normalized.startsWith('SELECT version')) return { rows: [] };
          if (normalized === 'BEGIN' || normalized.startsWith('SELECT pg_advisory')) return { rows: [] };
          if (normalized === 'ROLLBACK') return { rows: [] };
          throw new Error(`provider leaked ${PASSWORD}`);
        },
        release() {},
      };
    }
    async end() {}
  }
  await assert.rejects(() => run({
    env: environment({ PRODUCTION_MIGRATION_CONFIRM: CONFIRMATION_PHRASE }),
    apply: true,
    PoolClass: FailingPool,
    log() {},
  }), (error) => {
    assert.match(error.message, /database operation failed/);
    assert.doesNotMatch(error.message, new RegExp(PASSWORD));
    return true;
  });
});

test('pool construction failures remain sanitized and do not mask the safety error', async () => {
  class FailingPool {
    constructor() {
      throw new Error(`provider leaked ${PASSWORD}`);
    }
  }
  await assert.rejects(() => run({
    env: environment(),
    PoolClass: FailingPool,
    log() {},
  }), (error) => {
    assert.match(error.message, /database connection failed/);
    assert.doesNotMatch(error.message, new RegExp(PASSWORD));
    return true;
  });
});
