import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('production backup is locked to the production project and encrypted before upload', async () => {
  const [script, workflow] = await Promise.all([
    readFile(path.join(root, 'scripts/backup-production-supabase-ci.sh'), 'utf8'),
    readFile(path.join(root, '.github/workflows/sync-openai-usage.yml'), 'utf8'),
  ]);

  assert.match(script, /expected_project_ref="mpajyubbnnsdpgdizvht"/);
  assert.match(script, /urlparse\(os\.environ\['DATABASE_URL'\]\)/);
  assert.match(script, /unquote\(parsed\.username/);
  assert.match(script, /hostname\.endswith\('\.pooler\.supabase\.com'\)/);
  assert.match(script, /key\.lower\(\) != 'uselibpqcompat'/);
  assert.match(script, /PGDATABASE="\$\{pg_database_url\}" pg_dump/);
  assert.match(script, /sslmode=(?:require|verify-ca|verify-full)/);
  assert.match(script, /pg_dump/);
  assert.match(script, /openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000/);
  assert.match(script, /pg_restore --list/);
  assert.doesNotMatch(script, /echo .*database_url/i);

  assert.match(workflow, /operation:/);
  assert.match(workflow, /encrypted-backup/);
  assert.match(workflow, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.match(workflow, /PRODUCTION_BACKUP_KEY: \$\{\{ secrets\.PRODUCTION_BACKUP_KEY \}\}/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /retention-days: 3/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
});
