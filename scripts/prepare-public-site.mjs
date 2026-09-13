import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, '.public-site');

const publicFiles = [
  'index.html',
  'join.html',
  'membership.html',
  'cancel.html',
  'cancel.js',
  'recaps.html',
  'recaps.js',
  'recaps-data.json',
  'free-pick.html',
  'free-pick.js',
  'free-pick.css',
  'faq.html',
  'support.html',
  'terms.html',
  'privacy.html',
  'responsible-gambling.html',
  '404.html',
  'styles.css',
  'brand.css',
  'home.css',
  'home.js',
  'membership.css',
  'membership.js',
  'membership-theme.css',
  'robots.txt',
  'sitemap.xml',
  'betting-hub-logo.png',
  'betting-hub-logo-v2.png',
  'betting-hub-logo-final.png',
  'app.js'
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.join(outputRoot, 'guides'), { recursive: true });

await Promise.all(publicFiles.map((file) => cp(
  path.join(projectRoot, file),
  path.join(outputRoot, file)
)));

await cp(
  path.join(projectRoot, 'guides', 'how-to-choose-a-sports-betting-discord.html'),
  path.join(outputRoot, 'guides', 'how-to-choose-a-sports-betting-discord.html')
);
await cp(path.join(projectRoot, 'assets'), path.join(outputRoot, 'assets'), { recursive: true });

console.log(`Prepared ${publicFiles.length + 2} public site entries in ${outputRoot}.`);
