import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, '.public-site');
const sandboxRoot = path.join(projectRoot, '.public-referral-sandbox');

await import('./prepare-public-site.mjs');
await rm(sandboxRoot, { recursive: true, force: true });
await cp(publicRoot, sandboxRoot, { recursive: true });

const sandboxStyle = `<style data-sandbox-banner>
body { padding-top: 42px !important; }
.kbh-sandbox-banner { position: fixed; inset: 0 0 auto; z-index: 10000; min-height: 42px; display: grid; place-items: center; padding: 8px 16px; background: #5b21b6; color: #fff; font: 700 13px/1.25 system-ui, sans-serif; letter-spacing: .08em; text-align: center; }
</style>`;
const sandboxBanner = '<div class="kbh-sandbox-banner" role="status">STRIPE SANDBOX · TEST DATA ONLY · NO REAL MONEY</div>';

for (const page of ['index.html', 'join.html', 'membership.html', 'refer.html', 'cancel.html']) {
  const file = path.join(sandboxRoot, page);
  const html = await readFile(file, 'utf8');
  const noIndex = html.includes('name="robots"')
    ? html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex,nofollow" />')
    : html.replace('</head>', '  <meta name="robots" content="noindex,nofollow" />\n</head>');
  const withStyle = noIndex.replace('</head>', `${sandboxStyle}</head>`);
  await writeFile(file, withStyle.replace(/<body([^>]*)>/, `<body$1>${sandboxBanner}`), 'utf8');
}

console.log(`Prepared isolated referral sandbox site in ${sandboxRoot}.`);
