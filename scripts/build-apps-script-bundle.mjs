import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = [
  path.join(root, 'cloudflare', 'kobe-daily-picks-email.gs'),
  path.join(root, 'cloudflare', 'kobe-trends-inbox.gs'),
  path.join(root, 'cloudflare', 'member-welcome-email.gs'),
];
const output = path.join(root, 'cloudflare', 'kobe-operations-bundle.gs');

export async function buildAppsScriptBundle() {
  const content = await Promise.all(sources.map((source) => readFile(source, 'utf8')));
  const bundle = [
    '// GENERATED FILE — edit the version-controlled source files, then rebuild.',
    '// Paste this complete bundle into the installed Apps Script Code.gs file.',
    ...content,
  ].join('\n\n');
  await writeFile(output, `${bundle.trim()}\n`);
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await buildAppsScriptBundle());
}
